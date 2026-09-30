"use server";

// Staff Recipe Book server actions. Public endpoints reached only through the
// group's secret link token; recipes are only ever returned after the signed
// session cookie AND a fresh access check (checkAccess) pass. A person without
// access gets their name + positions for the friendly "no access" screen and
// nothing else. No prices or costs here.

import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { pinConfigured, isValidPinFormat, setInitialPin } from "@/lib/staff-count/pin";
import { recipeLinkActive } from "@/lib/recipe-book/link";
import { setBarSession, getBarSession, clearBarSession } from "@/lib/recipe-book/session";
import { identifyByPin, checkAccess, listAllowedWithoutPin } from "@/lib/recipe-book/access";
import { loadActiveRecipes } from "@/lib/recipe-book/load";
import { saveRecipeSafe, setActive, revertTo, listHistory, getEntry, accessOverview, type Editor } from "@/lib/recipe-book/edit";
import {
  canSeeHistory,
  type AccessOverview, type EntryResult, type FeedResult, type HistoryFilters, type HistoryResult, type SaveInput, type SaveResult, type SignInResult,
} from "@/lib/recipe-book/types";

async function orgId(): Promise<string | null> {
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  return org?.id ?? null;
}

async function logActivity(action: string, actorId: string | null, actorName: string | null, note?: string) {
  try {
    const organizationId = await orgId();
    if (!organizationId) return;
    await prisma.orderActivityLog.create({
      data: { organizationId, entity: "LINK", action, actorId, actorName, actorKind: "staff", source: "recipe_book", note },
    });
  } catch {
    // logging must never block staff
  }
}

// Sign in with the PIN alone (it says who is typing). Wrong PIN: no lockout,
// answered ~1s later to slow guessing (same as the count page, and it never
// touches the My Tips lockout counter).
export async function signIn(token: string, pin: string): Promise<SignInResult> {
  try {
    if (!pinConfigured()) return { ok: false, error: "not_configured" };
    if (!(await recipeLinkActive(token))) return { ok: false, error: "bad_link" };
    if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) return { ok: false, error: "bad_format" };

    const personId = await identifyByPin(pin);
    const who = personId ? await checkAccess(personId) : null;
    if (!who) {
      await new Promise((r) => setTimeout(r, 1000));
      return { ok: false, error: "wrong_pin" };
    }
    if (!who.allowed) {
      await clearBarSession(token);
      await logActivity("recipe_book_denied", who.personId, who.name, "Valid PIN, no recipe access");
      return { ok: false, denied: { name: who.name.split(" ")[0], positions: who.positions } };
    }
    await setBarSession(token, { personId: who.personId, name: who.name });
    await logActivity("recipe_book_sign_in", who.personId, who.name);
    return { ok: true };
  } catch {
    return { ok: false, error: "server" };
  }
}

// First-time PIN: only people who have recipe access and no PIN yet are listed
// (names only). The PIN goes into the one shared PIN table through the same
// tip_pin_write function Tip Entry and the count page use.
export async function listPinless(token: string): Promise<{ ok: true; people: { id: string; name: string }[] } | { ok: false; error: "bad_link" | "not_configured" | "server" }> {
  try {
    if (!pinConfigured()) return { ok: false, error: "not_configured" };
    if (!(await recipeLinkActive(token))) return { ok: false, error: "bad_link" };
    return { ok: true, people: await listAllowedWithoutPin() };
  } catch {
    return { ok: false, error: "server" };
  }
}

export async function createPin(token: string, personId: string, pin: string): Promise<{ ok: true } | { ok: false; error: "bad_link" | "not_configured" | "not_listed" | "taken" | "already_set" | "bad_format" | "server" }> {
  try {
    if (!pinConfigured()) return { ok: false, error: "not_configured" };
    if (!(await recipeLinkActive(token))) return { ok: false, error: "bad_link" };
    if (!isValidPinFormat(pin)) return { ok: false, error: "bad_format" };
    const person = (await listAllowedWithoutPin()).find((p) => p.id === personId);
    if (!person) return { ok: false, error: "not_listed" };
    const w = await setInitialPin(personId, pin, person.name);
    if (!w.ok) return { ok: false, error: w.error === "taken" ? "taken" : w.error === "already_set" ? "already_set" : "server" };
    await setBarSession(token, { personId, name: person.name });
    await logActivity("recipe_book_pin_created", personId, person.name, "First-time PIN created on the Recipe Book page");
    return { ok: true };
  } catch {
    return { ok: false, error: "server" };
  }
}

export async function signOut(token: string): Promise<{ ok: true }> {
  await clearBarSession(token);
  return { ok: true };
}

// Everything the page needs after sign-in: who I am + all active recipes.
export async function loadFeed(token: string): Promise<FeedResult> {
  try {
    if (!pinConfigured()) return { ok: false, error: "not_configured" };
    if (!(await recipeLinkActive(token))) return { ok: false, error: "bad_link" };
    const session = await getBarSession(token);
    if (!session) return { ok: false, error: "signed_out" };
    const who = await checkAccess(session.personId);
    if (!who || !who.allowed) {
      await clearBarSession(token);
      return { ok: false, error: "signed_out" };
    }
    const recipes = await loadActiveRecipes();
    return { ok: true, feed: { me: { name: who.name, role: who.role }, recipes } };
  } catch {
    return { ok: false, error: "server" };
  }
}

// ---------------------------------------------------------------------------
// Editing (Phase 3). Every save needs a PIN typed again, even when signed in:
// the PIN says who the editor is, and that person must have recipe access.
// A wrong PIN saves nothing. History, revert and "who can see this" are for
// owners and managers only.
// ---------------------------------------------------------------------------
async function device(): Promise<string | null> {
  try {
    const ua = (await headers()).get("user-agent");
    return ua ? ua.slice(0, 200) : null;
  } catch {
    return null;
  }
}

async function signedInPerson(token: string) {
  if (!pinConfigured() || !(await recipeLinkActive(token))) return null;
  const session = await getBarSession(token);
  if (!session) return null;
  const who = await checkAccess(session.personId);
  return who && who.allowed ? who : null;
}

async function editorFromPin(pin: string, needManager: boolean): Promise<Editor | "wrong_pin" | "no_access" | "forbidden"> {
  const personId = await identifyByPin(pin);
  const who = personId ? await checkAccess(personId) : null;
  if (!who) {
    await new Promise((r) => setTimeout(r, 1000));
    return "wrong_pin";
  }
  if (!who.allowed) return "no_access";
  if (needManager && !canSeeHistory(who.role)) return "forbidden";
  return { personId: who.personId, name: who.name };
}

export async function saveRecipeWithPin(token: string, pin: string, input: SaveInput): Promise<SaveResult> {
  try {
    if (!(await signedInPerson(token))) return { ok: false, error: "signed_out" };
    const ed = await editorFromPin(pin, false);
    if (typeof ed === "string") return { ok: false, error: ed };
    return await saveRecipeSafe(ed, "staff_page", input, await device());
  } catch {
    return { ok: false, error: "server" };
  }
}

export async function setActiveWithPin(token: string, pin: string, id: string, active: boolean): Promise<SaveResult> {
  try {
    if (!(await signedInPerson(token))) return { ok: false, error: "signed_out" };
    const ed = await editorFromPin(pin, false);
    if (typeof ed === "string") return { ok: false, error: ed };
    return await setActive(ed, "staff_page", id, active, await device());
  } catch {
    return { ok: false, error: "server" };
  }
}

export async function revertWithPin(token: string, pin: string, logId: string): Promise<SaveResult> {
  try {
    const me = await signedInPerson(token);
    if (!me) return { ok: false, error: "signed_out" };
    if (!canSeeHistory(me.role)) return { ok: false, error: "forbidden" };
    const ed = await editorFromPin(pin, true);
    if (typeof ed === "string") return { ok: false, error: ed };
    return await revertTo(ed, "staff_page", logId, await device());
  } catch {
    return { ok: false, error: "server" };
  }
}

export async function loadHistory(token: string, filters: HistoryFilters): Promise<HistoryResult> {
  try {
    const me = await signedInPerson(token);
    if (!me) return { ok: false, error: "signed_out" };
    if (!canSeeHistory(me.role)) return { ok: false, error: "forbidden" };
    return { ok: true, ...(await listHistory(filters ?? {})) };
  } catch {
    return { ok: false, error: "server" };
  }
}

export async function loadHistoryEntry(token: string, id: string): Promise<EntryResult> {
  try {
    const me = await signedInPerson(token);
    if (!me) return { ok: false, error: "signed_out" };
    if (!canSeeHistory(me.role)) return { ok: false, error: "forbidden" };
    const entry = await getEntry(id);
    return entry ? { ok: true, entry } : { ok: false, error: "not_found" };
  } catch {
    return { ok: false, error: "server" };
  }
}

export async function loadAccessOverview(token: string): Promise<AccessOverview> {
  try {
    const me = await signedInPerson(token);
    if (!me) return { ok: false, error: "signed_out" };
    if (!canSeeHistory(me.role)) return { ok: false, error: "forbidden" };
    return { ok: true, positions: await accessOverview() };
  } catch {
    return { ok: false, error: "server" };
  }
}

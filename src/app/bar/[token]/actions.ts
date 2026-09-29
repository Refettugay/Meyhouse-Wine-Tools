"use server";

// Staff Recipe Book server actions. Public endpoints reached only through the
// group's secret link token; recipes are only ever returned after the signed
// session cookie AND a fresh access check (checkAccess) pass. A person without
// access gets their name + positions for the friendly "no access" screen and
// nothing else. No prices or costs here.

import { prisma } from "@/lib/db";
import { pinConfigured, isValidPinFormat, setInitialPin } from "@/lib/staff-count/pin";
import { recipeLinkActive } from "@/lib/recipe-book/link";
import { setBarSession, getBarSession, clearBarSession } from "@/lib/recipe-book/session";
import { identifyByPin, checkAccess, listAllowedWithoutPin } from "@/lib/recipe-book/access";
import { loadActiveRecipes } from "@/lib/recipe-book/load";
import type { FeedResult, SignInResult } from "@/lib/recipe-book/types";

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

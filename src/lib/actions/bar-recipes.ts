"use server";

// Admin actions for the staff bar Recipe Book. Owners and managers only
// (checked from the caller's Schedule profile role on every call — the
// Beverage session role folds supervisors into MANAGER, so it can't be used).

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { newCountToken } from "@/lib/staff-count/link";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { loadActiveRecipes } from "@/lib/recipe-book/load";
import { saveRecipeSafe, setActive, revertTo, listHistory, getEntry, accessOverview, type Editor } from "@/lib/recipe-book/edit";
import type { AccessOverview, EntryResult, FeedResult, HistoryFilters, HistoryResult, SaveInput, SaveResult } from "@/lib/recipe-book/types";

export async function barRecipeAdmin(): Promise<{ ok: true; userId: string; userName: string; organizationId: string } | { ok: false; error: string }> {
  const session = await requireAuth();
  const rows = await prisma.$queryRaw<{ role: string | null }[]>`
    select role from public.profiles where id = ${session.userId}::uuid`;
  const role = rows[0]?.role;
  if (role !== "owner" && role !== "manager") return { ok: false, error: "Only owners and managers can manage the Recipe Book." };
  return { ok: true, userId: session.userId, userName: session.userName, organizationId: session.organizationId };
}

async function log(organizationId: string, action: string, actorId: string, actorName: string, note: string, extra?: { field?: string; oldValue?: string; newValue?: string }) {
  await prisma.orderActivityLog.create({
    data: { organizationId, entity: "LINK", action, actorId, actorName, actorKind: "manager", source: "recipe_book_admin", note, ...extra },
  });
}

// Creates the group's link if there is none; otherwise replaces the token (the
// old link stops working at once and everyone signed in on it is signed out).
export async function rotateRecipeLink(): Promise<{ error: string } | { success: true }> {
  const a = await barRecipeAdmin();
  if (!a.ok) return { error: a.error };
  const existing = await prisma.barRecipeLink.findUnique({ where: { id: 1 }, select: { id: true } });
  const token = newCountToken();
  if (existing) await prisma.barRecipeLink.update({ where: { id: 1 }, data: { token, rotatedAt: new Date() } });
  else await prisma.barRecipeLink.create({ data: { id: 1, token, enabled: true, createdById: a.userId, createdByName: a.userName } });
  await log(a.organizationId, existing ? "rotate" : "create", a.userId, a.userName, "Bar Recipe Book link");
  revalidatePath("/dashboard/bar-recipes");
  return { success: true };
}

export async function setRecipeLinkEnabled(enabled: boolean): Promise<{ error: string } | { success: true }> {
  const a = await barRecipeAdmin();
  if (!a.ok) return { error: a.error };
  const existing = await prisma.barRecipeLink.findUnique({ where: { id: 1 }, select: { enabled: true } });
  if (!existing) return { error: "There's no link yet." };
  if (existing.enabled === enabled) return { success: true };
  await prisma.barRecipeLink.update({ where: { id: 1 }, data: { enabled } });
  await log(a.organizationId, enabled ? "enable" : "disable", a.userId, a.userName, "Bar Recipe Book link", {
    field: "enabled", oldValue: String(existing.enabled), newValue: String(enabled),
  });
  revalidatePath("/dashboard/bar-recipes");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Admin copy of the Recipe Book (same screens as the staff page). Owners and
// managers only; saves are stamped with their account (no PIN).
// ---------------------------------------------------------------------------
async function adminEditor(): Promise<{ editor: Editor; role: "owner" | "manager" } | null> {
  const a = await barRecipeAdmin();
  if (!a.ok) return null;
  const rows = await prisma.$queryRaw<{ role: string }[]>`select role from public.profiles where id = ${a.userId}::uuid`;
  return { editor: { personId: a.userId, name: a.userName }, role: rows[0]?.role === "owner" ? "owner" : "manager" };
}

async function adminDevice(): Promise<string | null> {
  try {
    const ua = (await headers()).get("user-agent");
    return ua ? `admin · ${ua.slice(0, 190)}` : "admin";
  } catch {
    return "admin";
  }
}

export async function loadFeedAdmin(): Promise<FeedResult> {
  try {
    const a = await adminEditor();
    if (!a) return { ok: false, error: "signed_out" };
    return { ok: true, feed: { me: { name: a.editor.name, role: a.role }, recipes: await loadActiveRecipes() } };
  } catch {
    return { ok: false, error: "server" };
  }
}

export async function saveRecipeAdmin(input: SaveInput): Promise<SaveResult> {
  const a = await adminEditor();
  if (!a) return { ok: false, error: "forbidden" };
  return saveRecipeSafe(a.editor, "admin", input, await adminDevice());
}

export async function setActiveAdmin(id: string, active: boolean): Promise<SaveResult> {
  const a = await adminEditor();
  if (!a) return { ok: false, error: "forbidden" };
  return setActive(a.editor, "admin", id, active, await adminDevice());
}

export async function revertAdmin(logId: string): Promise<SaveResult> {
  const a = await adminEditor();
  if (!a) return { ok: false, error: "forbidden" };
  return revertTo(a.editor, "admin", logId, await adminDevice());
}

export async function loadHistoryAdmin(filters: HistoryFilters): Promise<HistoryResult> {
  try {
    if (!(await adminEditor())) return { ok: false, error: "forbidden" };
    return { ok: true, ...(await listHistory(filters ?? {})) };
  } catch {
    return { ok: false, error: "server" };
  }
}

export async function loadHistoryEntryAdmin(id: string): Promise<EntryResult> {
  try {
    if (!(await adminEditor())) return { ok: false, error: "forbidden" };
    const entry = await getEntry(id);
    return entry ? { ok: true, entry } : { ok: false, error: "not_found" };
  } catch {
    return { ok: false, error: "server" };
  }
}

export async function loadAccessOverviewAdmin(): Promise<AccessOverview> {
  try {
    if (!(await adminEditor())) return { ok: false, error: "forbidden" };
    return { ok: true, positions: await accessOverview() };
  } catch {
    return { ok: false, error: "server" };
  }
}

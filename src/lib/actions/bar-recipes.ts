"use server";

// Admin actions for the staff bar Recipe Book. Owners and managers only
// (checked from the caller's Schedule profile role on every call — the
// Beverage session role folds supervisors into MANAGER, so it can't be used).

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { newCountToken } from "@/lib/staff-count/link";
import { revalidatePath } from "next/cache";

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

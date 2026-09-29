"use server";

// Transfers tab (Staff Ordering phase 5, owners/admins only). A transfer is an
// order line moved with "Move to <store>" on Review & approve:
//   transferToLocationId   = the store that orders it and sends it on (goods FROM)
//   transferFromLocationId = the store that needs it (goods TO)
// Each line keeps the cost / case size it had when it was moved. Editing them
// here updates that line AND the product in Product Hub (going forward).
// No inventory stock is changed. Every change is logged (source = transfers).

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { canApproveOrders } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

async function transferLine(itemId: string) {
  const session = await requireAuth();
  if (!canApproveOrders(session)) return { error: "Only owners and admins can change transfers." as const };
  const item = await prisma.orderListItem.findFirst({
    where: { id: itemId, transferFromLocationId: { not: null }, orderList: { organizationId: session.organizationId } },
    select: {
      id: true, ingredientId: true, transferStatus: true, transferFromLocationId: true, orderListId: true,
      unitCostCentsSnapshot: true, casePackSizeSnapshot: true,
      ingredient: { select: { name: true, bottleCostCents: true, casePackSize: true } },
    },
  });
  if (!item) return { error: "Transfer not found." as const };
  return { session, item };
}

function actor(session: Awaited<ReturnType<typeof requireAuth>>) {
  return { organizationId: session.organizationId, actorId: session.userId, actorName: session.userName, actorKind: "manager", source: "transfers" };
}

function revalidate() {
  revalidatePath("/dashboard/products");
}

// "Mark transferred" (or undo) — records who and when.
export async function markTransferred(itemId: string, done = true) {
  const r = await transferLine(itemId);
  if ("error" in r) return { error: r.error };
  const { session, item } = r;
  const status = done ? "TRANSFERRED" : "PENDING";
  if (item.transferStatus === status) return { success: true };
  const now = new Date();
  await prisma.$transaction([
    prisma.orderListItem.update({
      where: { id: item.id },
      data: done
        ? { transferStatus: "TRANSFERRED", transferredAt: now, transferredById: session.userId, transferredByName: session.userName }
        : { transferStatus: "PENDING", transferredAt: null, transferredById: null, transferredByName: null },
    }),
    prisma.orderActivityLog.create({
      data: {
        ...actor(session), locationId: item.transferFromLocationId, orderListId: item.orderListId, orderListItemId: item.id,
        ingredientId: item.ingredientId, entity: "TRANSFER", action: done ? "mark_transferred" : "unmark_transferred",
        field: "transferStatus", oldValue: item.transferStatus, newValue: status, note: item.ingredient.name,
      },
    }),
  ]);
  revalidate();
  return { success: true };
}

// Case size or unit cost (cents per bottle): this line's snapshot + the
// product in Product Hub. The page asks "are you sure" before calling.
export async function setTransferValue(itemId: string, field: "casePackSize" | "unitCostCents", value: number) {
  if (field !== "casePackSize" && field !== "unitCostCents") return { error: "Invalid field" };
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1 || n > (field === "casePackSize" ? 999 : 10_000_000)) {
    return { error: field === "casePackSize" ? "Case size must be a whole number from 1 to 999." : "Enter a cost above $0." };
  }
  const r = await transferLine(itemId);
  if ("error" in r) return { error: r.error };
  const { session, item } = r;

  const lineOld = field === "casePackSize" ? item.casePackSizeSnapshot : item.unitCostCentsSnapshot;
  const productOld = field === "casePackSize" ? item.ingredient.casePackSize : item.ingredient.bottleCostCents;
  const fmt = (v: number | null) => (v === null ? "—" : field === "unitCostCents" ? `$${(v / 100).toFixed(2)}` : String(v));
  const productField = field === "casePackSize" ? "casePackSize" : "bottleCostCents";

  await prisma.$transaction([
    prisma.orderListItem.update({
      where: { id: item.id },
      data: field === "casePackSize" ? { casePackSizeSnapshot: n } : { unitCostCentsSnapshot: n },
    }),
    prisma.ingredient.update({
      where: { id: item.ingredientId, organizationId: session.organizationId },
      data: { [productField]: n },
    }),
    prisma.orderActivityLog.createMany({
      data: [
        {
          ...actor(session), locationId: item.transferFromLocationId, orderListId: item.orderListId, orderListItemId: item.id,
          ingredientId: item.ingredientId, entity: "TRANSFER", action: "edit", field, oldValue: fmt(lineOld), newValue: fmt(n), note: item.ingredient.name,
        },
        {
          ...actor(session), ingredientId: item.ingredientId, entity: "PRODUCT", action: "edit", field: productField,
          oldValue: fmt(productOld), newValue: fmt(n), note: `${item.ingredient.name} (changed from Transfers)`,
        },
      ],
    }),
  ]);
  revalidate();
  revalidatePath("/dashboard/database");
  return { success: true };
}

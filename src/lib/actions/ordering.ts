"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";

// Set (or clear) a product's order unit from the admin Order tab.
// null = "Not set" — staff may then pick CS/BTL per order line.
// Every change is written to OrderActivityLog (who, when, old → new).
export async function setProductOrderUnit(ingredientId: string, unit: "CASE" | "BOTTLE" | null) {
  const session = await requireAuth();
  const orgId = session.organizationId;
  if (unit !== null && unit !== "CASE" && unit !== "BOTTLE") return { error: "Invalid unit" };

  const product = await prisma.ingredient.findFirst({
    where: { id: ingredientId, organizationId: orgId },
    select: { id: true, orderUnit: true },
  });
  if (!product) return { error: "Product not found" };
  if ((product.orderUnit ?? null) === unit) return { success: true };

  try {
    await prisma.$transaction([
      prisma.ingredient.update({ where: { id: product.id }, data: { orderUnit: unit } }),
      prisma.orderActivityLog.create({
        data: {
          organizationId: orgId,
          ingredientId: product.id,
          entity: "PRODUCT",
          action: "set_order_unit",
          field: "orderUnit",
          oldValue: product.orderUnit ?? null,
          newValue: unit,
          actorId: session.userId,
          actorName: session.userName,
          actorKind: "manager",
          source: "admin",
        },
      }),
    ]);
  } catch (e) {
    console.error("setProductOrderUnit failed:", e);
    return { error: unit === null ? "Could not clear the unit yet — try again later." : "Could not save the unit." };
  }

  revalidatePath("/dashboard/products");
  return { success: true };
}

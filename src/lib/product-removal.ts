import { prisma } from "@/lib/db";

// Permanently removes a product and ALL related records. Shared by the admin
// Beverage tool and the staff count page — callers must check access first.
export async function hardDeleteIngredient(id: string, orgId: string): Promise<{ alreadyDeleted: boolean }> {
  const exists = await prisma.ingredient.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true },
  });
  if (!exists) return { alreadyDeleted: true };

  // Get inventory items so we can delete stock counts linked to them
  const invItems = await prisma.inventoryItem.findMany({
    where: { ingredientId: id, organizationId: orgId },
    select: { id: true },
  });
  const invIds = invItems.map((i) => i.id);

  // Delete stock counts first (they reference inventory items)
  if (invIds.length > 0) {
    await prisma.stockCount.deleteMany({ where: { inventoryItemId: { in: invIds } } });
  }

  // Delete order list items that reference this ingredient (if any)
  try {
    await prisma.orderListItem.deleteMany({ where: { ingredientId: id } });
  } catch { /* table may not have that field */ }

  // Delete recipe ingredients referencing this product
  await prisma.recipeIngredient.deleteMany({ where: { ingredientId: id } });

  // Delete product SKUs
  await prisma.productSKU.deleteMany({ where: { ingredientId: id } });

  // Delete inventory items
  await prisma.inventoryItem.deleteMany({ where: { ingredientId: id, organizationId: orgId } });

  // Finally delete the ingredient itself
  await prisma.ingredient.delete({ where: { id, organizationId: orgId } });
  return { alreadyDeleted: false };
}

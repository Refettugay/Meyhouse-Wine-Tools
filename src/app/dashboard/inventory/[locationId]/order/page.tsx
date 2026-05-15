import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CountAndOrderForm } from "@/components/inventory/count-and-order-form";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ locationId: string }>;
}) {
  const { locationId } = await params;
  const orgId = await getOrganizationId();

  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId: orgId },
    include: {
      inventoryItems: {
        where: { ingredient: { isActive: true, onMenu: true } },
        include: {
          ingredient: { include: { vendorRef: true } },
          storageArea: true,
        },
        orderBy: [
          { storageArea: { sortOrder: "asc" } },
          { ingredient: { name: "asc" } },
        ],
      },
      storageAreas: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!location) notFound();

  // Serialize for the client component
  const items = location.inventoryItems.map((item) => ({
    id: item.id,
    ingredient: {
      name: item.ingredient.name,
      vendor: item.ingredient.vendorRef?.name || item.ingredient.vendor || null,
      ingredientCategory: item.ingredient.ingredientCategory,
      orderUnit: item.ingredient.orderUnit || "BOTTLE",
      casePackSize: item.ingredient.casePackSize,
    },
    parLevel: item.parLevel,
    currentStock: item.currentStock,
    unit: item.unit,
    storageArea: item.storageArea
      ? { id: item.storageArea.id, name: item.storageArea.name }
      : null,
    lastCountedAt: item.lastCountedAt?.toISOString() || null,
  }));

  return (
    <div className="p-4 lg:p-8">
      <Link
        href="/dashboard/inventory"
        className="flex items-center gap-2 text-stone-500 hover:text-stone-900 mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Inventory & Ordering
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Count & Order</h1>
        <p className="text-stone-500 text-sm">
          {location.name} — Count current stock and auto-generate an order for
          items below par. {items.length} items to count.
        </p>
      </div>

      <CountAndOrderForm locationId={locationId} items={items} />
    </div>
  );
}

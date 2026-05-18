import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { InventoryView } from "@/components/inventory/inventory-view";

export default async function LocationInventoryPage({
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
        include: { ingredient: true },
        orderBy: { ingredient: { name: "asc" } },
      },
    },
  });

  if (!location) notFound();

  const ingredients = await prisma.ingredient.findMany({
    where: { organizationId: orgId, isActive: true, onMenu: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-4 lg:p-8">
      <Link
        href="/dashboard/inventory"
        className="flex items-center gap-2 text-[var(--ink-muted)] hover:text-[var(--brand-brown)] mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Inventory & Ordering
      </Link>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{location.name}</h1>
          <p className="text-[var(--ink-muted)] text-sm">
            {location.inventoryItems.length} items · View and edit par levels
            and storage areas
          </p>
        </div>
        <Link
          href={`/dashboard/inventory/${locationId}/order`}
          className="flex items-center gap-2 px-3 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium transition-colors"
        >
          <ClipboardList className="w-4 h-4" />
          Count & Order
        </Link>
      </div>

      <InventoryView
        locationId={locationId}
        items={location.inventoryItems}
        allIngredients={ingredients}
      />
    </div>
  );
}

import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import Link from "next/link";
import { ArrowLeft, Layers, Info } from "lucide-react";
import { MergedOrderView } from "@/components/inventory/merged-order-view";

export default async function MergedOrderPage() {
  const orgId = await getOrganizationId();

  // Find the latest DRAFT order per location (orders that haven't been sent yet)
  const locations = await prisma.location.findMany({
    where: { organizationId: orgId },
    orderBy: { sortOrder: "asc" },
    include: {
      orderLists: {
        where: { status: "DRAFT" },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          items: {
            include: {
              ingredient: { include: { vendorRef: true } },
            },
          },
        },
      },
    },
  });

  // Build a flat list of all items from the latest draft orders
  type MergedItem = {
    orderId: string;
    itemId: string;
    name: string;
    vendor: string;
    locationId: string;
    locationName: string;
    quantityNeeded: number;
    unit: string;
    countedStock: number | null;
    parSnapshot: number | null;
    bottleCostCents: number | null;
    casePackSize: number | null;
    orderDate: string;
  };

  const allItems: MergedItem[] = [];
  for (const loc of locations) {
    for (const order of loc.orderLists) {
      for (const item of order.items) {
        allItems.push({
          orderId: order.id,
          itemId: item.id,
          name: item.ingredient.name,
          vendor:
            item.vendor ||
            item.ingredient.vendorRef?.name ||
            item.ingredient.vendor ||
            "No Vendor",
          locationId: loc.id,
          locationName: loc.name,
          quantityNeeded: item.quantityNeeded,
          unit: item.unit,
          countedStock: item.countedStock,
          parSnapshot: item.parSnapshot,
          bottleCostCents: item.ingredient.bottleCostCents,
          casePackSize: item.ingredient.casePackSize,
          orderDate: order.createdAt.toISOString(),
        });
      }
    }
  }

  const locationsWithDrafts = locations.filter(
    (l) => l.orderLists.length > 0
  ).length;

  return (
    <div className="p-4 lg:p-8">
      <Link
        href="/dashboard/inventory"
        className="flex items-center gap-2 text-[var(--ink-muted)] hover:text-[var(--brand-brown)] mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Inventory & Ordering
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-6 h-6 text-[var(--brand-olive)]" />
          <h1 className="text-2xl font-bold">Merged Order View</h1>
        </div>
        <p className="text-[var(--ink-muted)] text-sm">
          All draft orders from {locationsWithDrafts} of {locations.length}{" "}
          locations, grouped by vendor
        </p>
      </div>

      {allItems.length === 0 ? (
        <div className="bg-white border border-[var(--line)] rounded-xl p-8 text-center">
          <Info className="w-10 h-10 text-[var(--ink-muted)] mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-1">No draft orders</h2>
          <p className="text-sm text-[var(--ink-muted)]">
            Complete a Count & Order at one of your locations first. Only
            orders in DRAFT status appear in the merged view.
          </p>
        </div>
      ) : (
        <MergedOrderView items={allItems} />
      )}
    </div>
  );
}

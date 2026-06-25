import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import Link from "next/link";
import { ArrowLeft, Layers, Info, ClipboardCheck } from "lucide-react";
import { MergedOrderView } from "@/components/inventory/merged-order-view";

// Orders still in the approval pipeline (not yet emailed/ordered).
const ACTIVE_STATUSES = ["IN_PROGRESS", "SUBMITTED", "APPROVED"];

export default async function MergedOrderPage() {
  const orgId = await getOrganizationId();

  // Show every active order per location, grouped by vendor (cross-store).
  const locations = await prisma.location.findMany({
    where: { organizationId: orgId },
    orderBy: { sortOrder: "asc" },
    include: {
      orderLists: {
        where: { status: { in: ACTIVE_STATUSES } },
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            where: { status: { not: "REJECTED" } },
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
    status: string;
    transferNote: string | null;
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
          status: order.status,
          transferNote: item.transferNote,
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

      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-6 h-6 text-[var(--brand-olive)]" />
            <h1 className="text-2xl font-bold">Merged Order View</h1>
          </div>
          <p className="text-[var(--ink-muted)] text-sm">
            Active orders from {locationsWithDrafts} of {locations.length}{" "}
            locations, grouped by vendor
          </p>
        </div>
        <Link
          href="/dashboard/inventory/orders/review"
          className="flex items-center gap-2 px-3 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium transition-colors"
        >
          <ClipboardCheck className="w-4 h-4" />
          Review &amp; Approve
        </Link>
      </div>

      {allItems.length === 0 ? (
        <div className="bg-white border border-[var(--line)] rounded-xl p-8 text-center">
          <Info className="w-10 h-10 text-[var(--ink-muted)] mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-1">No active orders</h2>
          <p className="text-sm text-[var(--ink-muted)]">
            Build an order in the Order tab at one of your locations first.
            In-progress, submitted, and approved orders appear here.
          </p>
        </div>
      ) : (
        <MergedOrderView items={allItems} />
      )}
    </div>
  );
}

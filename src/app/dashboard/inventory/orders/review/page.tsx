import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { canApproveOrders } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck, Info } from "lucide-react";
import { ReviewOrdersView } from "@/components/inventory/review-orders-view";

export default async function OrderReviewPage() {
  const session = await requireAuth();
  // Server-side gate: managers cannot reach the review screen (requirement 3).
  if (!canApproveOrders(session)) {
    redirect("/dashboard/products?mode=ordering");
  }
  const orgId = session.organizationId;

  const orders = await prisma.orderList.findMany({
    where: { organizationId: orgId, status: "SUBMITTED" },
    orderBy: { submittedAt: "asc" },
    include: {
      location: true,
      items: {
        include: { ingredient: { include: { vendorRef: true } } },
        orderBy: { ingredient: { name: "asc" } },
      },
    },
  });

  const serialized = orders.map((o) => ({
    id: o.id,
    locationId: o.locationId,
    locationName: o.location.name,
    createdByName: o.createdByName,
    submittedAt: o.submittedAt?.toISOString() || null,
    reviewNote: o.reviewNote,
    items: o.items.map((i) => ({
      id: i.id,
      name: i.ingredient.name,
      vendor: i.vendor || i.ingredient.vendorRef?.name || i.ingredient.vendor || "No Vendor",
      quantityNeeded: i.quantityNeeded,
      unit: i.unit,
      countedStock: i.countedStock,
      parSnapshot: i.parSnapshot,
      status: i.status,
      transferNote: i.transferNote,
      transferFromLocationId: i.transferFromLocationId,
    })),
  }));

  return (
    <div className="p-4 lg:p-8">
      <Link
        href="/dashboard/products?mode=ordering"
        className="flex items-center gap-2 text-[var(--ink-muted)] hover:text-[var(--brand-brown)] mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Ordering
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardCheck className="w-6 h-6 text-[var(--brand-olive)]" />
          <h1 className="text-2xl font-bold">Order Review &amp; Approval</h1>
        </div>
        <p className="text-[var(--ink-muted)] text-sm">
          {serialized.length} submitted order{serialized.length === 1 ? "" : "s"} awaiting your approval.
          Only approved orders can be emailed to vendors.
        </p>
      </div>

      {serialized.length === 0 ? (
        <div className="bg-white border border-[var(--line)] rounded-xl p-8 text-center">
          <Info className="w-10 h-10 text-[var(--ink-muted)] mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-1">No orders to review</h2>
          <p className="text-sm text-[var(--ink-muted)]">
            When a manager submits an order for approval it will appear here.
          </p>
        </div>
      ) : (
        <ReviewOrdersView orders={serialized} />
      )}
    </div>
  );
}

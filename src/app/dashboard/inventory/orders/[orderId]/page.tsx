import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShoppingCart } from "lucide-react";
import { OrderDetailView } from "@/components/inventory/order-detail-view";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const orgId = await getOrganizationId();

  const order = await prisma.orderList.findFirst({
    where: { id: orderId, organizationId: orgId },
    include: {
      location: true,
      items: {
        include: {
          ingredient: { include: { vendorRef: true } },
        },
      },
    },
  });

  if (!order) notFound();

  // Serialize
  const items = order.items.map((i) => ({
    id: i.id,
    name: i.ingredient.name,
    vendor: i.vendor,
    countedStock: i.countedStock,
    parSnapshot: i.parSnapshot,
    quantityNeeded: i.quantityNeeded,
    unit: i.unit,
    storageArea: i.storageArea,
    status: i.status,
    bottleCostCents: i.ingredient.bottleCostCents,
    casePackSize: i.ingredient.casePackSize,
  }));

  const createdAt = new Date(order.createdAt);

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
          <ShoppingCart className="w-6 h-6 text-[var(--brand-olive)]" />
          <h1 className="text-2xl font-bold">{order.name}</h1>
          <span
            className={`text-xs px-2 py-1 rounded ${
              order.status === "SENT"
                ? "bg-green-100 text-green-700"
                : order.status === "RECEIVED"
                ? "bg-blue-100 text-blue-700"
                : order.status === "COMPLETED"
                ? "bg-[var(--brand-cream)] text-[var(--brand-brown)]"
                : "bg-[rgba(74,93,39,0.12)] text-[var(--brand-olive-hover)]"
            }`}
          >
            {order.status}
          </span>
        </div>
        <p className="text-[var(--ink-muted)] text-sm">
          {order.location.name} ·{" "}
          {createdAt.toLocaleDateString()}{" "}
          {createdAt.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {" · "}
          {items.length} items
        </p>
        {order.notes && (
          <p className="mt-2 text-sm bg-[#FAF7F1] border border-[var(--brand-olive)] rounded-lg px-3 py-2 text-[var(--brand-olive-hover)] inline-block">
            {order.notes}
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <div className="bg-white border border-[var(--line)] rounded-xl p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-1">
            Everything at or above par
          </h2>
          <p className="text-sm text-[var(--ink-muted)]">
            Nothing needed to be ordered during this count.
          </p>
        </div>
      ) : (
        <OrderDetailView orderId={order.id} items={items} />
      )}
    </div>
  );
}

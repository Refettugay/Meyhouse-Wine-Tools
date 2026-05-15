import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import Link from "next/link";
import { ArrowLeft, History, ShoppingCart } from "lucide-react";
import { OrderHistoryList } from "@/components/inventory/order-history-list";

export default async function OrderHistoryPage() {
  const orgId = await getOrganizationId();

  // Last 8 weeks = 56 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 56);

  const [orders, locations] = await Promise.all([
    prisma.orderList.findMany({
      where: {
        organizationId: orgId,
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: "desc" },
      include: {
        location: true,
        items: {
          include: {
            ingredient: true,
          },
        },
      },
    }),
    prisma.location.findMany({
      where: { organizationId: orgId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  // Serialize
  const serialized = orders.map((o) => {
    const totalBottles = o.items.reduce((s, i) => s + i.quantityNeeded, 0);
    const totalCost = o.items.reduce((s, i) => {
      const cost = i.ingredient.bottleCostCents;
      if (!cost) return s;
      return s + cost * i.quantityNeeded;
    }, 0);
    return {
      id: o.id,
      name: o.name,
      status: o.status,
      notes: o.notes,
      createdAt: o.createdAt.toISOString(),
      location: { id: o.location.id, name: o.location.name },
      itemCount: o.items.length,
      totalBottles,
      totalCostCents: totalCost,
    };
  });

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
        <div className="flex items-center gap-2 mb-1">
          <History className="w-6 h-6 text-amber-600" />
          <h1 className="text-2xl font-bold">Order History</h1>
        </div>
        <p className="text-stone-500 text-sm">
          Last 8 weeks of orders across all locations — {orders.length} orders
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center">
          <ShoppingCart className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <p className="text-stone-500">No orders yet.</p>
          <p className="text-stone-400 text-sm mt-1">
            Complete a count & order at one of your locations to get started.
          </p>
        </div>
      ) : (
        <OrderHistoryList orders={serialized} locations={locations} />
      )}
    </div>
  );
}

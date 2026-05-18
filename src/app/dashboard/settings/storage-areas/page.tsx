import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StorageAreasManager } from "@/components/settings/storage-areas-manager";

export default async function StorageAreasPage() {
  const orgId = await getOrganizationId();

  const locations = await prisma.location.findMany({
    where: { organizationId: orgId },
    orderBy: { sortOrder: "asc" },
    include: {
      storageAreas: {
        orderBy: { name: "asc" },
        include: {
          inventoryItems: {
            include: {
              ingredient: { select: { bottleCostCents: true } },
            },
          },
          inventoryItems2: {
            include: {
              ingredient: { select: { bottleCostCents: true } },
            },
          },
        },
      },
    },
  });

  const data = locations.map((l) => ({
    id: l.id,
    name: l.name,
    storageAreas: l.storageAreas.map((sa) => {
      // Combine items from both slot 1 (primary) and slot 2 (secondary)
      const allItems = [...sa.inventoryItems, ...sa.inventoryItems2];
      const uniqueCount = new Set(allItems.map((i) => i.id)).size;
      // Sum value: currentStock × bottleCostCents for each item
      let totalCents = 0;
      const seen = new Set<string>();
      for (const item of allItems) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        const cost = item.ingredient?.bottleCostCents || 0;
        totalCents += Math.round(item.currentStock * cost);
      }
      return {
        id: sa.id,
        name: sa.name,
        productCount: uniqueCount,
        valueCents: totalCents,
      };
    }),
  }));

  return (
    <div className="p-4 lg:p-8 max-w-3xl">
      <Link
        href="/dashboard/settings"
        className="flex items-center gap-2 text-[var(--ink-muted)] hover:text-[var(--brand-brown)] mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Settings
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Storage Areas</h1>
        <p className="text-[var(--ink-muted)] text-sm mt-1">
          Click a location or area name to rename it. Values are calculated from current inventory counts.
        </p>
      </div>

      <StorageAreasManager locations={data} />
    </div>
  );
}

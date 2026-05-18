import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LocationsManager } from "@/components/inventory/locations-manager";

export default async function LocationsPage() {
  const orgId = await getOrganizationId();

  const locations = await prisma.location.findMany({
    where: { organizationId: orgId },
    orderBy: { sortOrder: "asc" },
    include: {
      storageAreas: {
        orderBy: { sortOrder: "asc" },
      },
      _count: {
        select: { inventoryItems: true },
      },
    },
  });

  return (
    <div className="p-4 lg:p-8 max-w-3xl">
      <Link
        href="/dashboard/inventory"
        className="flex items-center gap-2 text-[var(--ink-muted)] hover:text-[var(--brand-brown)] mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Inventory
      </Link>

      <h1 className="text-2xl font-bold mb-6">Manage Locations</h1>

      <LocationsManager locations={locations} />
    </div>
  );
}

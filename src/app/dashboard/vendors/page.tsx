import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { VendorsManager } from "@/components/vendor/vendors-manager";

export default async function VendorsPage() {
  const orgId = await getOrganizationId();

  const [vendors, locations] = await Promise.all([
    prisma.vendor.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
      include: {
        reps: {
          include: {
            locations: {
              include: { location: true },
            },
          },
        },
        _count: {
          select: { ingredients: true },
        },
      },
    }),
    prisma.location.findMany({
      where: { organizationId: orgId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return (
    <div className="p-4 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Vendors</h1>
        <p className="text-[var(--ink-muted)] text-sm mt-1">
          Manage suppliers and their representatives per location
        </p>
      </div>

      <VendorsManager vendors={vendors} locations={locations} />
    </div>
  );
}

import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { getOrgSettings } from "@/lib/actions/settings";
import { getActiveUnits } from "@/lib/actions/units";
import { notFound } from "next/navigation";
import { ProductFormV2 } from "@/components/product/product-form-v2";

export default async function EditDatabaseProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await getOrganizationId();

  const [product, vendors, locations, existingProducts, settings, units] =
    await Promise.all([
      prisma.ingredient.findFirst({
        where: { id, organizationId: orgId },
        include: {
          inventoryItems: {
            select: { locationId: true, parLevel: true },
          },
        },
      }),
      prisma.vendor.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
      }),
      prisma.location.findMany({
        where: { organizationId: orgId },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.ingredient.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { ingredientCategory: true },
      }),
      getOrgSettings(),
      getActiveUnits(),
    ]);

  if (!product) notFound();

  const ingCats = existingProducts
    .map((p) => p.ingredientCategory)
    .filter((c): c is string => !!c);
  const categories = [
    ...new Set([...settings.categories, ...ingCats]),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div className="p-4 lg:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Edit: {product.name}</h1>
      <ProductFormV2
        vendors={vendors}
        locations={locations}
        categories={categories}
        units={units}
        existingProduct={product}
        mode="database"
      />
    </div>
  );
}

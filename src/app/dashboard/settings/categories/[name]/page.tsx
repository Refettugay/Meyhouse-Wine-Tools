import { getOrganizationId } from "@/lib/session";
import { getCategoriesConfig } from "@/lib/actions/settings";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CategoryDetail } from "@/components/settings/category-detail";
import { notFound } from "next/navigation";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: rawName } = await params;
  const categoryName = decodeURIComponent(rawName);
  const orgId = await getOrganizationId();

  const config = await getCategoriesConfig();
  const sub = config.subs.find((s) => s.name === categoryName);

  if (!sub) {
    notFound();
  }

  const parent = config.parents.find((p) => p.name === sub.parent);
  const productCount = await prisma.ingredient.count({
    where: { organizationId: orgId, isActive: true, ingredientCategory: categoryName },
  });

  return (
    <div className="p-4 lg:p-8 max-w-2xl">
      <Link
        href="/dashboard/settings/categories"
        className="flex items-center gap-2 text-stone-500 hover:text-stone-900 mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Categories
      </Link>

      <CategoryDetail
        sub={sub}
        parent={parent || null}
        parents={config.parents}
        productCount={productCount}
      />
    </div>
  );
}

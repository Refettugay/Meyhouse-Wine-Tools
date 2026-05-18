import { getCategoriesConfig } from "@/lib/actions/settings";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ParentCategoryDetail } from "@/components/settings/parent-category-detail";
import { notFound } from "next/navigation";

export default async function ParentCategoryDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: rawName } = await params;
  const parentName = decodeURIComponent(rawName);

  const config = await getCategoriesConfig();
  const parent = config.parents.find((p) => p.name === parentName);

  if (!parent) {
    notFound();
  }

  const subCount = config.subs.filter((s) => s.parent === parentName).length;

  return (
    <div className="p-4 lg:p-8 max-w-2xl">
      <Link
        href="/dashboard/settings/categories"
        className="flex items-center gap-2 text-[var(--ink-muted)] hover:text-[var(--brand-brown)] mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Categories
      </Link>

      <ParentCategoryDetail parent={parent} subCount={subCount} />
    </div>
  );
}

import { getCategoriesConfig } from "@/lib/actions/settings";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AddCategoryForm } from "@/components/settings/add-category-form";

export default async function AddCategoryPage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const config = await getCategoriesConfig();

  return (
    <div className="p-4 lg:p-8 max-w-2xl">
      <Link
        href="/dashboard/settings/categories"
        className="flex items-center gap-2 text-[var(--ink-muted)] hover:text-[var(--brand-brown)] mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Categories
      </Link>

      <h1 className="text-2xl font-bold mb-6">Add New Category</h1>

      <AddCategoryForm
        parents={config.parents}
        defaultParent={sp.parent || ""}
        defaultType={sp.type || "sub"}
      />
    </div>
  );
}

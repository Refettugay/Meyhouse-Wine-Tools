"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  moveProductToMenu,
  permanentlyDeleteProduct,
} from "@/lib/actions/products";
import {
  Search,
  Edit,
  Trash2,
  FileText,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ArrowRight,
} from "lucide-react";

interface DbProduct {
  id: string;
  name: string;
  type: string;
  bottleCostCents: number | null;
  bottleSizeMl: number | null;
  casePackSize: number | null;
  vendor: string | null;
  ingredientCategory: string | null;
  notes: string | null;
  updatedAt: Date;
  vendorRef: { id: string; name: string } | null;
}

type SortField = "name" | "vendor" | "category" | "recent";
type SortDir = "asc" | "desc";

export function DatabaseList({ products }: { products: DbProduct[] }) {
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [sortField, setSortField] = useState<SortField>("recent");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [error, setError] = useState("");

  const vendors = useMemo(
    () =>
      [
        ...new Set(
          products.map((p) => p.vendorRef?.name || p.vendor || "").filter(Boolean)
        ),
      ].sort() as string[],
    [products]
  );

  const categories = useMemo(
    () =>
      [
        ...new Set(products.map((p) => p.ingredientCategory).filter(Boolean)),
      ].sort() as string[],
    [products]
  );

  const filtered = useMemo(() => {
    return products
      .filter((p) => {
        const matchesSearch =
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.notes || "").toLowerCase().includes(search.toLowerCase());
        const vendorName = p.vendorRef?.name || p.vendor || "";
        const matchesVendor =
          vendorFilter === "ALL" || vendorName === vendorFilter;
        const matchesCategory =
          categoryFilter === "ALL" ||
          p.ingredientCategory === categoryFilter;
        return matchesSearch && matchesVendor && matchesCategory;
      })
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        switch (sortField) {
          case "name":
            return a.name.localeCompare(b.name) * dir;
          case "vendor":
            return (
              (a.vendorRef?.name || a.vendor || "").localeCompare(
                b.vendorRef?.name || b.vendor || ""
              ) * dir
            );
          case "category":
            return (
              (a.ingredientCategory || "").localeCompare(
                b.ingredientCategory || ""
              ) * dir
            );
          case "recent":
            return (
              (new Date(a.updatedAt).getTime() -
                new Date(b.updatedAt).getTime()) *
              dir
            );
          default:
            return 0;
        }
      });
  }, [products, search, vendorFilter, categoryFilter, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "recent" ? "desc" : "asc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 text-amber-600" />
    ) : (
      <ArrowDown className="w-3 h-3 text-amber-600" />
    );
  }

  return (
    <div>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-3">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
          <input
            type="text"
            placeholder="Search name or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="ALL">All Vendors</option>
          {vendors.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="ALL">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-stone-500 mb-3">
        Showing {filtered.length} of {products.length}
      </p>

      {products.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center">
          <FileText className="w-10 h-10 text-stone-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-1">
            Your tasting database is empty
          </h2>
          <p className="text-sm text-stone-500 mb-4">
            Add products you&apos;ve tasted with vendor reps. You can move them
            to the menu later.
          </p>
          <Link
            href="/dashboard/database/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Add your first product
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="hidden md:grid md:grid-cols-12 gap-2 px-4 py-3 border-b border-stone-200 text-xs font-medium text-stone-500 uppercase">
            <button
              onClick={() => toggleSort("name")}
              className="col-span-4 flex items-center gap-1 hover:text-stone-900 transition-colors text-left"
            >
              Product <SortIcon field="name" />
            </button>
            <button
              onClick={() => toggleSort("vendor")}
              className="col-span-2 flex items-center gap-1 hover:text-stone-900 transition-colors text-left"
            >
              Vendor <SortIcon field="vendor" />
            </button>
            <button
              onClick={() => toggleSort("category")}
              className="col-span-2 flex items-center gap-1 hover:text-stone-900 transition-colors text-left"
            >
              Category <SortIcon field="category" />
            </button>
            <div className="col-span-1 text-left">Cost</div>
            <button
              onClick={() => toggleSort("recent")}
              className="col-span-1 flex items-center gap-1 hover:text-stone-900 transition-colors text-left"
            >
              Added <SortIcon field="recent" />
            </button>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          <div className="divide-y divide-stone-200">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-stone-500">
                No products match your filters
              </div>
            ) : (
              filtered.map((product) => {
                const vendorName =
                  product.vendorRef?.name || product.vendor || "—";
                const date = new Date(product.updatedAt).toLocaleDateString();
                return (
                  <div
                    key={product.id}
                    className="px-4 py-3 hover:bg-stone-50"
                  >
                    <div className="grid grid-cols-12 gap-2 items-start">
                      <div className="col-span-12 md:col-span-4">
                        <div className="flex items-start gap-2">
                          {product.notes && (
                            <FileText className="w-3 h-3 text-amber-600 mt-1 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{product.name}</p>
                            {product.bottleSizeMl && (
                              <p className="text-xs text-stone-500">
                                {product.bottleSizeMl}ml
                                {product.casePackSize &&
                                  product.casePackSize > 1 &&
                                  ` · ${product.casePackSize}pk`}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="hidden md:block md:col-span-2 text-sm text-stone-700">
                        {vendorName}
                      </div>
                      <div className="hidden md:block md:col-span-2 text-sm text-stone-700">
                        {product.ingredientCategory || "—"}
                      </div>
                      <div className="hidden md:block md:col-span-1 text-sm">
                        {product.bottleCostCents ? (
                          <span className="text-amber-600 font-medium">
                            ${(product.bottleCostCents / 100).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </div>
                      <div className="hidden md:block md:col-span-1 text-xs text-stone-500">
                        {date}
                      </div>
                      <div className="col-span-12 md:col-span-2 flex items-center justify-end gap-1 flex-wrap">
                        <button
                          onClick={async () => {
                            if (
                              confirm(
                                `Move "${product.name}" to the active menu?`
                              )
                            ) {
                              await moveProductToMenu(product.id);
                            }
                          }}
                          className="flex items-center gap-1 px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-xs font-medium transition-colors"
                          title="Move to menu"
                        >
                          <ArrowRight className="w-3 h-3" />
                          To Menu
                        </button>
                        <Link
                          href={`/dashboard/database/${product.id}/edit`}
                          className="p-1.5 text-stone-500 hover:text-amber-600 transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={async () => {
                            if (
                              confirm(
                                `Permanently delete "${product.name}"? This cannot be undone.`
                              )
                            ) {
                              const result = await permanentlyDeleteProduct(
                                product.id
                              );
                              if (result?.error) setError(result.error);
                            }
                          }}
                          className="p-1.5 text-stone-500 hover:text-red-600 transition-colors"
                          title="Permanently delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Notes preview */}
                    {product.notes && (
                      <div className="mt-2 ml-0 md:ml-5 text-xs text-stone-600 bg-amber-50 border-l-2 border-amber-300 pl-3 py-1.5 rounded-r">
                        {product.notes.length > 200
                          ? product.notes.slice(0, 200) + "..."
                          : product.notes}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { deleteProduct } from "@/lib/actions/products";
import {
  Search,
  Edit,
  Trash2,
  MapPin,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  type: string;
  bottleCostCents: number | null;
  bottleSizeMl: number | null;
  casePackSize: number | null;
  vendor: string | null;
  ingredientCategory: string | null;
  vendorRef: { id: string; name: string } | null;
  inventoryItems: {
    location: { id: string; name: string };
  }[];
}

interface Location {
  id: string;
  name: string;
}

type SortField = "name" | "vendor" | "category" | "cost";
type SortDir = "asc" | "desc";

export function ProductsList({
  products,
  locations,
}: {
  products: Product[];
  locations: Location[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [vendorFilter, setVendorFilter] = useState(
    searchParams.get("vendor") || "ALL"
  );
  const [categoryFilter, setCategoryFilter] = useState(
    searchParams.get("category") || "ALL"
  );
  const [locationFilter, setLocationFilter] = useState(
    searchParams.get("location") || "ALL"
  );
  const [sortField, setSortField] = useState<SortField>(
    (searchParams.get("sort") as SortField) || "name"
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    (searchParams.get("dir") as SortDir) || "asc"
  );

  const updateUrl = useCallback(
    (updates: Partial<{
      search: string;
      vendor: string;
      category: string;
      location: string;
      sort: string;
      dir: string;
    }>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (!value || value === "ALL" || (key === "sort" && value === "name") || (key === "dir" && value === "asc")) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.replace(`/dashboard/products${qs ? `?${qs}` : ""}`, {
        scroll: false,
      });
    },
    [router, searchParams]
  );

  function handleSearchChange(v: string) {
    setSearch(v);
    updateUrl({ search: v });
  }
  function handleVendorChange(v: string) {
    setVendorFilter(v);
    updateUrl({ vendor: v });
  }
  function handleCategoryChange(v: string) {
    setCategoryFilter(v);
    updateUrl({ category: v });
  }
  function handleLocationChange(v: string) {
    setLocationFilter(v);
    updateUrl({ location: v });
  }

  const vendors = useMemo(
    () =>
      [
        ...new Set(
          products
            .map((p) => p.vendorRef?.name || p.vendor || "")
            .filter(Boolean)
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
        const matchesSearch = p.name
          .toLowerCase()
          .includes(search.toLowerCase());
        const vendorName = p.vendorRef?.name || p.vendor || "";
        const matchesVendor =
          vendorFilter === "ALL" || vendorName === vendorFilter;
        const matchesCategory =
          categoryFilter === "ALL" ||
          p.ingredientCategory === categoryFilter;
        const matchesLocation =
          locationFilter === "ALL" ||
          p.inventoryItems.some((i) => i.location.id === locationFilter);
        return (
          matchesSearch && matchesVendor && matchesCategory && matchesLocation
        );
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
          case "cost":
            return ((a.bottleCostCents || 0) - (b.bottleCostCents || 0)) * dir;
          default:
            return 0;
        }
      });
  }, [
    products,
    search,
    vendorFilter,
    categoryFilter,
    locationFilter,
    sortField,
    sortDir,
  ]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      const newDir = sortDir === "asc" ? "desc" : "asc";
      setSortDir(newDir);
      updateUrl({ sort: field, dir: newDir });
    } else {
      setSortField(field);
      setSortDir("asc");
      updateUrl({ sort: field, dir: "asc" });
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
      {/* Search & filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <select
          value={vendorFilter}
          onChange={(e) => handleVendorChange(e.target.value)}
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
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="ALL">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={locationFilter}
          onChange={(e) => handleLocationChange(e.target.value)}
          className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="ALL">All Locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-stone-500 mb-3">
        Showing {filtered.length} of {products.length}
      </p>

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {/* Desktop headers */}
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
          <button
            onClick={() => toggleSort("cost")}
            className="col-span-2 flex items-center gap-1 hover:text-stone-900 transition-colors text-left"
          >
            Cost <SortIcon field="cost" />
          </button>
          <div className="col-span-2 text-right">Stores</div>
        </div>

        {/* Mobile sort */}
        <div className="md:hidden px-4 py-2 border-b border-stone-200 flex items-center gap-2">
          <span className="text-xs text-stone-500">Sort:</span>
          <select
            value={`${sortField}-${sortDir}`}
            onChange={(e) => {
              const [f, d] = e.target.value.split("-");
              setSortField(f as SortField);
              setSortDir(d as SortDir);
              updateUrl({ sort: f, dir: d });
            }}
            className="flex-1 px-2 py-1 bg-stone-100 border border-stone-300 rounded text-stone-900 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="vendor-asc">Vendor (A-Z)</option>
            <option value="category-asc">Category (A-Z)</option>
            <option value="cost-asc">Cost (Low-High)</option>
            <option value="cost-desc">Cost (High-Low)</option>
          </select>
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
              const storeCount = product.inventoryItems.length;
              return (
                <div
                  key={product.id}
                  className="px-4 py-3 grid grid-cols-12 gap-2 items-center hover:bg-stone-50"
                >
                  <div className="col-span-12 md:col-span-4">
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
                  <div className="hidden md:block md:col-span-2 text-sm text-stone-700">
                    {vendorName}
                  </div>
                  <div className="hidden md:block md:col-span-2 text-sm text-stone-700">
                    {product.ingredientCategory || "—"}
                  </div>
                  <div className="hidden md:block md:col-span-2 text-sm">
                    {product.bottleCostCents ? (
                      <span className="text-amber-600 font-medium">
                        ${(product.bottleCostCents / 100).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </div>
                  <div className="col-span-8 md:col-span-2 flex items-center justify-end gap-2">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-stone-400" />
                      <span className="text-xs text-stone-600">
                        {storeCount}/{locations.length}
                      </span>
                    </div>
                    <Link
                      href={`/dashboard/products/${product.id}/edit`}
                      className="p-1.5 text-stone-500 hover:text-amber-600 transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={async () => {
                        if (
                          confirm(
                            `Remove "${product.name}" from the menu? It will be moved to the Product Database where you can restore it later.`
                          )
                        ) {
                          await deleteProduct(product.id);
                        }
                      }}
                      className="p-1.5 text-stone-500 hover:text-red-600 transition-colors"
                      title="Remove from menu (moves to Product Database)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

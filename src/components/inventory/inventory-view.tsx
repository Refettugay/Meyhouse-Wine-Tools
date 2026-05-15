"use client";

import { useState } from "react";
import {
  updateInventoryItem,
  deleteInventoryItem,
  addInventoryItem,
} from "@/lib/actions/inventory";
import {
  Search,
  AlertTriangle,
  Trash2,
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";

type SortField = "name" | "vendor" | "par" | "stock";
type SortDir = "asc" | "desc";

interface InventoryItem {
  id: string;
  parLevel: number;
  currentStock: number;
  unit: string;
  lastCountedAt: Date | null;
  ingredient: {
    id: string;
    name: string;
    vendor: string | null;
    ingredientCategory: string | null;
    bottleSizeMl: number | null;
    bottleCostCents: number | null;
  };
}

interface IngredientOption {
  id: string;
  name: string;
  vendor: string | null;
  ingredientCategory: string | null;
}

export function InventoryView({
  locationId,
  items,
  allIngredients,
}: {
  locationId: string;
  items: InventoryItem[];
  allIngredients: IngredientOption[];
}) {
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    parLevel: string;
    currentStock: string;
  }>({ parLevel: "", currentStock: "" });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newIngredientId, setNewIngredientId] = useState("");
  const [newParLevel, setNewParLevel] = useState("");
  const [newCurrentStock, setNewCurrentStock] = useState("");
  const [error, setError] = useState("");

  const vendors = [
    ...new Set(items.map((i) => i.ingredient.vendor).filter(Boolean)),
  ].sort() as string[];

  const filtered = items
    .filter((item) => {
      const matchesSearch = item.ingredient.name
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesVendor =
        vendorFilter === "ALL" || item.ingredient.vendor === vendorFilter;
      let matchesStatus = true;
      if (statusFilter === "BELOW_PAR")
        matchesStatus = item.currentStock < item.parLevel;
      else if (statusFilter === "OUT")
        matchesStatus = item.currentStock === 0 && item.parLevel > 0;
      else if (statusFilter === "OK")
        matchesStatus = item.currentStock >= item.parLevel && item.parLevel > 0;
      return matchesSearch && matchesVendor && matchesStatus;
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortField) {
        case "name":
          return a.ingredient.name.localeCompare(b.ingredient.name) * dir;
        case "vendor":
          return (
            (a.ingredient.vendor || "").localeCompare(b.ingredient.vendor || "") * dir
          );
        case "par":
          return (a.parLevel - b.parLevel) * dir;
        case "stock":
          return (a.currentStock - b.currentStock) * dir;
        default:
          return 0;
      }
    });

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
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

  function startEdit(item: InventoryItem) {
    setEditingId(item.id);
    setEditValues({
      parLevel: String(item.parLevel),
      currentStock: String(item.currentStock),
    });
  }

  async function saveEdit(id: string) {
    await updateInventoryItem(id, {
      parLevel: parseFloat(editValues.parLevel) || 0,
      currentStock: parseFloat(editValues.currentStock) || 0,
    });
    setEditingId(null);
  }

  async function handleAdd() {
    setError("");
    if (!newIngredientId) {
      setError("Please select an ingredient");
      return;
    }
    const result = await addInventoryItem({
      locationId,
      ingredientId: newIngredientId,
      parLevel: parseFloat(newParLevel) || 0,
      currentStock: parseFloat(newCurrentStock) || 0,
      unit: "bottle",
    });
    if (result?.error) {
      setError(result.error);
    } else {
      setShowAddForm(false);
      setNewIngredientId("");
      setNewParLevel("");
      setNewCurrentStock("");
    }
  }

  // Filter out ingredients already in inventory
  const existingIds = new Set(items.map((i) => i.ingredient.id));
  const availableIngredients = allIngredients.filter(
    (ing) => !existingIds.has(ing.id)
  );

  return (
    <div>
      {/* Search & filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
          <input
            type="text"
            placeholder="Search items..."
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
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="ALL">All Status</option>
          <option value="BELOW_PAR">Below Par</option>
          <option value="OUT">Out of Stock</option>
          <option value="OK">OK</option>
        </select>
      </div>

      {/* Add button / form */}
      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 text-amber-500 hover:text-amber-600 text-sm mb-4"
        >
          <Plus className="w-4 h-4" />
          Add Item to Inventory
        </button>
      ) : (
        <div className="bg-white border border-amber-500/30 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-amber-600">Add Inventory Item</h3>
            <button
              onClick={() => {
                setShowAddForm(false);
                setError("");
              }}
              className="text-stone-500 hover:text-stone-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              value={newIngredientId}
              onChange={(e) => setNewIngredientId(e.target.value)}
              className="md:col-span-3 px-3 py-2 bg-stone-100 border border-stone-300 rounded-lg text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Select ingredient...</option>
              {availableIngredients.map((ing) => (
                <option key={ing.id} value={ing.id}>
                  {ing.name} {ing.vendor ? `(${ing.vendor})` : ""}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              value={newParLevel}
              onChange={(e) => setNewParLevel(e.target.value)}
              placeholder="Par level"
              className="px-3 py-2 bg-stone-100 border border-stone-300 rounded-lg text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              type="number"
              step="0.01"
              value={newCurrentStock}
              onChange={(e) => setNewCurrentStock(e.target.value)}
              placeholder="Current stock"
              className="px-3 py-2 bg-stone-100 border border-stone-300 rounded-lg text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              onClick={handleAdd}
              className="px-3 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium transition-colors"
            >
              Add Item
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="hidden md:grid md:grid-cols-12 gap-2 px-4 py-3 border-b border-stone-200 text-xs font-medium text-stone-500 uppercase">
          <button
            onClick={() => toggleSort("name")}
            className="col-span-5 flex items-center gap-1 hover:text-stone-900 transition-colors text-left"
          >
            Item <SortIcon field="name" />
          </button>
          <button
            onClick={() => toggleSort("vendor")}
            className="col-span-2 flex items-center gap-1 hover:text-stone-900 transition-colors text-left"
          >
            Vendor <SortIcon field="vendor" />
          </button>
          <button
            onClick={() => toggleSort("par")}
            className="col-span-2 flex items-center justify-center gap-1 hover:text-stone-900 transition-colors"
          >
            Par <SortIcon field="par" />
          </button>
          <button
            onClick={() => toggleSort("stock")}
            className="col-span-2 flex items-center justify-center gap-1 hover:text-stone-900 transition-colors"
          >
            Stock <SortIcon field="stock" />
          </button>
          <div className="col-span-1"></div>
        </div>

        {/* Mobile sort selector */}
        <div className="md:hidden px-4 py-2 border-b border-stone-200 flex items-center gap-2">
          <span className="text-xs text-stone-500">Sort:</span>
          <select
            value={`${sortField}-${sortDir}`}
            onChange={(e) => {
              const [f, d] = e.target.value.split("-");
              setSortField(f as SortField);
              setSortDir(d as SortDir);
            }}
            className="flex-1 px-2 py-1 bg-stone-100 border border-stone-300 rounded text-stone-900 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="vendor-asc">Vendor (A-Z)</option>
            <option value="vendor-desc">Vendor (Z-A)</option>
            <option value="par-asc">Par (Low-High)</option>
            <option value="par-desc">Par (High-Low)</option>
            <option value="stock-asc">Stock (Low-High)</option>
            <option value="stock-desc">Stock (High-Low)</option>
          </select>
        </div>
        <div className="divide-y divide-stone-200">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-stone-500">
              No items match your filters
            </div>
          ) : (
            filtered.map((item) => {
              const isBelowPar = item.currentStock < item.parLevel;
              const isOut =
                item.currentStock === 0 && item.parLevel > 0;
              const isEditing = editingId === item.id;

              return (
                <div
                  key={item.id}
                  className="px-4 py-3 grid grid-cols-12 gap-2 items-center hover:bg-stone-100/50"
                >
                  <div className="col-span-12 md:col-span-5">
                    <p className="font-medium text-sm">
                      {item.ingredient.name}
                    </p>
                    <p className="text-xs text-stone-400 md:hidden">
                      {item.ingredient.vendor} - {item.ingredient.ingredientCategory}
                    </p>
                  </div>
                  <div className="hidden md:block md:col-span-2 text-xs text-stone-500">
                    {item.ingredient.vendor || "—"}
                  </div>
                  <div className="col-span-4 md:col-span-2 text-center">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.parLevel}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            parLevel: e.target.value,
                          })
                        }
                        className="w-16 px-2 py-1 bg-stone-100 border border-stone-300 rounded text-stone-900 text-sm text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    ) : (
                      <span className="text-sm text-stone-700">
                        {item.parLevel}
                      </span>
                    )}
                  </div>
                  <div className="col-span-4 md:col-span-2 text-center">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.currentStock}
                        onChange={(e) =>
                          setEditValues({
                            ...editValues,
                            currentStock: e.target.value,
                          })
                        }
                        className="w-16 px-2 py-1 bg-stone-100 border border-stone-300 rounded text-stone-900 text-sm text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    ) : (
                      <span
                        className={`text-sm font-medium inline-flex items-center gap-1 ${
                          isOut
                            ? "text-red-600"
                            : isBelowPar
                            ? "text-amber-600"
                            : "text-green-600"
                        }`}
                      >
                        {isBelowPar && (
                          <AlertTriangle className="w-3 h-3" />
                        )}
                        {item.currentStock}
                      </span>
                    )}
                  </div>
                  <div className="col-span-4 md:col-span-1 flex items-center justify-end gap-1">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => saveEdit(item.id)}
                          className="px-2 py-1 bg-amber-600 hover:bg-amber-500 rounded text-xs font-medium"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-2 py-1 bg-stone-200 hover:bg-zinc-600 rounded text-xs"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(item)}
                          className="text-xs text-amber-500 hover:text-amber-600"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (
                              confirm(
                                `Remove ${item.ingredient.name} from inventory?`
                              )
                            ) {
                              await deleteInventoryItem(item.id);
                            }
                          }}
                          className="p-1 text-stone-500 hover:text-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
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

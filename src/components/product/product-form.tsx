"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProduct, updateProduct } from "@/lib/actions/products";
import { createVendor } from "@/lib/actions/vendors";
import {
  addBottleSize as addBottleSizeAction,
  addCaseSize as addCaseSizeAction,
  addProductCategory,
} from "@/lib/actions/settings";
import { ArrowLeft, Plus, X } from "lucide-react";

interface Vendor {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

interface ExistingProduct {
  id: string;
  name: string;
  type: string;
  vendorId: string | null;
  ingredientCategory: string | null;
  bottleSizeMl: number | null;
  casePackSize: number | null;
  bottleCostCents: number | null;
  purchaseCostCents: number | null;
  purchaseQty: number | null;
  purchaseUnit: string | null;
  notes: string | null;
  onMenu: boolean;
  inventoryItems: {
    locationId: string;
    parLevel: number;
  }[];
}

export function ProductForm({
  vendors: initialVendors,
  locations,
  categories: initialCategories,
  bottleSizes: initialBottleSizes,
  casePackSizes: initialCaseSizes,
  existingProduct,
  mode = "menu",
}: {
  vendors: Vendor[];
  locations: Location[];
  categories: string[];
  bottleSizes: number[];
  casePackSizes: number[];
  existingProduct?: ExistingProduct;
  mode?: "menu" | "database";
}) {
  const router = useRouter();
  const [vendors, setVendors] = useState(initialVendors);
  // Lookup lists come from org settings merged with existing product values.
  // "New" additions via the inline "+" buttons are only added locally for
  // this session — to persist them, use Settings → Lookup Values.
  const [categories, setCategories] = useState(
    [...new Set(initialCategories)].sort((a, b) => a.localeCompare(b))
  );
  const [bottleSizes, setBottleSizes] = useState(
    [...new Set(initialBottleSizes)].sort((a, b) => a - b)
  );
  const [caseSizes, setCaseSizes] = useState(
    [...new Set(initialCaseSizes)].sort((a, b) => a - b)
  );

  const [name, setName] = useState(existingProduct?.name || "");
  const [type, setType] = useState(existingProduct?.type || "LIQUID");
  const [vendorId, setVendorId] = useState(existingProduct?.vendorId || "");
  const [category, setCategory] = useState(
    existingProduct?.ingredientCategory || ""
  );
  const [bottleSizeMl, setBottleSizeMl] = useState(
    existingProduct?.bottleSizeMl?.toString() || ""
  );
  const [casePackSize, setCasePackSize] = useState(
    existingProduct?.casePackSize?.toString() || "1"
  );
  const [bottleCost, setBottleCost] = useState(
    existingProduct?.bottleCostCents
      ? (existingProduct.bottleCostCents / 100).toString()
      : ""
  );
  const [purchaseCost, setPurchaseCost] = useState(
    existingProduct?.purchaseCostCents
      ? (existingProduct.purchaseCostCents / 100).toString()
      : ""
  );
  const [purchaseQty, setPurchaseQty] = useState(
    existingProduct?.purchaseQty?.toString() || ""
  );
  const [purchaseUnit, setPurchaseUnit] = useState(
    existingProduct?.purchaseUnit || ""
  );
  const [notes, setNotes] = useState(existingProduct?.notes || "");

  // Location selection
  const [selectedLocIds, setSelectedLocIds] = useState<Set<string>>(
    new Set(existingProduct?.inventoryItems.map((i) => i.locationId) || [])
  );
  const [parLevel, setParLevel] = useState(
    existingProduct?.inventoryItems[0]?.parLevel?.toString() || ""
  );

  // Modals
  const [newVendorName, setNewVendorName] = useState("");
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newSizeMl, setNewSizeMl] = useState("");
  const [showNewSize, setShowNewSize] = useState(false);
  const [newCaseSize, setNewCaseSize] = useState("");
  const [showNewCaseSize, setShowNewCaseSize] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function toggleLocation(id: string) {
    const newSet = new Set(selectedLocIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedLocIds(newSet);
  }

  function toggleAllLocations() {
    if (selectedLocIds.size === locations.length) {
      setSelectedLocIds(new Set());
    } else {
      setSelectedLocIds(new Set(locations.map((l) => l.id)));
    }
  }

  async function handleCreateVendor() {
    if (!newVendorName.trim()) return;
    const result = await createVendor({ name: newVendorName.trim() });
    if (result?.error) {
      setError(result.error);
    } else if (result?.vendor) {
      setVendors([...vendors, { id: result.vendor.id, name: result.vendor.name }]);
      setVendorId(result.vendor.id);
      setNewVendorName("");
      setShowNewVendor(false);
    }
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    const trimmed = newCategoryName.trim();
    if (!categories.includes(trimmed)) {
      setCategories([...categories, trimmed].sort((a, b) => a.localeCompare(b)));
      // Persist to org settings so it's available next time
      await addProductCategory(trimmed);
    }
    setCategory(trimmed);
    setNewCategoryName("");
    setShowNewCategory(false);
  }

  async function handleAddSize() {
    const val = parseFloat(newSizeMl);
    if (!val || val <= 0) return;
    if (!bottleSizes.includes(val)) {
      setBottleSizes([...bottleSizes, val].sort((a, b) => a - b));
      await addBottleSizeAction(val);
    }
    setBottleSizeMl(val.toString());
    setNewSizeMl("");
    setShowNewSize(false);
  }

  async function handleAddCaseSize() {
    const val = parseInt(newCaseSize);
    if (!val || val <= 0) return;
    if (!caseSizes.includes(val)) {
      setCaseSizes([...caseSizes, val].sort((a, b) => a - b));
      await addCaseSizeAction(val);
    }
    setCasePackSize(val.toString());
    setNewCaseSize("");
    setShowNewCaseSize(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setLoading(true);

    const data = {
      name,
      type,
      vendorId: vendorId || undefined,
      ingredientCategory: category || undefined,
      bottleSizeMl: bottleSizeMl ? parseInt(bottleSizeMl) : undefined,
      casePackSize: casePackSize ? parseInt(casePackSize) : undefined,
      bottleCostCents: bottleCost
        ? Math.round(parseFloat(bottleCost) * 100)
        : undefined,
      purchaseCostCents: purchaseCost
        ? Math.round(parseFloat(purchaseCost) * 100)
        : undefined,
      purchaseQty: purchaseQty ? parseFloat(purchaseQty) : undefined,
      purchaseUnit: purchaseUnit || undefined,
      notes: notes || undefined,
      locationIds: [...selectedLocIds],
      parLevel: parLevel ? parseFloat(parLevel) : 0,
    };

    const result = existingProduct
      ? await updateProduct(existingProduct.id, data)
      : await createProduct({ ...data, onMenu: mode === "menu" });

    if ((result as any)?.error) {
      setError((result as any).error);
      setLoading(false);
    } else {
      router.back();
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-2 text-[var(--ink-muted)] hover:text-[var(--brand-brown)] mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Products
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="bg-white border border-[var(--line)] rounded-xl p-4 space-y-4">
          <h2 className="font-semibold">Product Info</h2>

          <div>
            <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
              Name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Haku Vodka"
              className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
            >
              <option value="LIQUID">Liquid (Spirit, Mixer, Juice)</option>
              <option value="SOLID">Solid (Sugar, Food Items)</option>
              <option value="GARNISH">Garnish</option>
            </select>
          </div>

          {/* Vendor dropdown */}
          <div>
            <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
              Vendor
            </label>
            {!showNewVendor ? (
              <div className="flex gap-2">
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                >
                  <option value="">— Select vendor —</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewVendor(true)}
                  className="px-3 py-2 bg-[var(--brand-cream)] hover:bg-[var(--line)] rounded-lg text-sm text-[var(--brand-brown)] whitespace-nowrap"
                >
                  <Plus className="w-4 h-4 inline mr-1" />
                  New
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  placeholder="New vendor name"
                  className="flex-1 px-3 py-2 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                />
                <button
                  type="button"
                  onClick={handleCreateVendor}
                  className="px-3 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewVendor(false);
                    setNewVendorName("");
                  }}
                  className="p-2 text-[var(--ink-muted)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Category dropdown */}
          <div>
            <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
              Category
            </label>
            {!showNewCategory ? (
              <div className="flex gap-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                >
                  <option value="">— Select category —</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewCategory(true)}
                  className="px-3 py-2 bg-[var(--brand-cream)] hover:bg-[var(--line)] rounded-lg text-sm text-[var(--brand-brown)] whitespace-nowrap"
                >
                  <Plus className="w-4 h-4 inline mr-1" />
                  New
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Bourbon, Gin, Cordial"
                  className="flex-1 px-3 py-2 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="px-3 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewCategory(false);
                    setNewCategoryName("");
                  }}
                  className="p-2 text-[var(--ink-muted)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Bottle Size & Case Pack Size */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
                Bottle Size (ml)
              </label>
              {!showNewSize ? (
                <div className="flex gap-1">
                  <select
                    value={bottleSizeMl}
                    onChange={(e) => setBottleSizeMl(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                  >
                    <option value="">—</option>
                    {bottleSizes.map((s) => (
                      <option key={s} value={s}>
                        {s}ml
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewSize(true)}
                    className="px-2 py-2 bg-[var(--brand-cream)] hover:bg-[var(--line)] rounded-lg text-sm text-[var(--brand-brown)]"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={newSizeMl}
                    onChange={(e) => setNewSizeMl(e.target.value)}
                    placeholder="ml"
                    className="flex-1 px-3 py-2 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                  />
                  <button
                    type="button"
                    onClick={handleAddSize}
                    className="px-2 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewSize(false)}
                    className="p-2 text-[var(--ink-muted)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
                Case Pack Size
              </label>
              {!showNewCaseSize ? (
                <div className="flex gap-1">
                  <select
                    value={casePackSize}
                    onChange={(e) => setCasePackSize(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                  >
                    {caseSizes.map((s) => (
                      <option key={s} value={s}>
                        {s === 1 ? "1 (single)" : `${s}-pack`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewCaseSize(true)}
                    className="px-2 py-2 bg-[var(--brand-cream)] hover:bg-[var(--line)] rounded-lg text-sm text-[var(--brand-brown)]"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={newCaseSize}
                    onChange={(e) => setNewCaseSize(e.target.value)}
                    placeholder="#"
                    className="flex-1 px-3 py-2 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                  />
                  <button
                    type="button"
                    onClick={handleAddCaseSize}
                    className="px-2 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewCaseSize(false)}
                    className="p-2 text-[var(--ink-muted)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Costs */}
          {(type === "LIQUID" || type === "GARNISH") && (
            <div>
              <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
                Bottle Cost ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={bottleCost}
                onChange={(e) => setBottleCost(e.target.value)}
                placeholder="30.00"
                className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
              />
            </div>
          )}

          {type === "SOLID" && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
                  Purchase Cost ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchaseQty}
                  onChange={(e) => setPurchaseQty(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
                  Unit
                </label>
                <input
                  value={purchaseUnit}
                  onChange={(e) => setPurchaseUnit(e.target.value)}
                  placeholder="each"
                  className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Notes / Tasting notes */}
        <div className="bg-white border border-[var(--line)] rounded-xl p-4 space-y-3">
          <div>
            <h2 className="font-semibold">Notes / Tasting Notes</h2>
            <p className="text-xs text-[var(--ink-muted)] mt-1">
              Add tasting notes, flavor profile, rep info, or anything to
              remember about this product.
            </p>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder="e.g. Oaky vanilla with a smoky finish. Great in old fashioneds. Tasted 2024-03-15 with Sarah from SWS."
            className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] resize-y"
          />
        </div>

        {/* Location selection — only for menu products */}
        {(mode === "menu" || (existingProduct && existingProduct.onMenu)) && (
          <div className="bg-white border border-[var(--line)] rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Available At Stores</h2>
              <button
                type="button"
                onClick={toggleAllLocations}
                className="text-xs text-[var(--brand-olive)] hover:text-[var(--brand-olive-hover)]"
              >
                {selectedLocIds.size === locations.length
                  ? "Deselect all"
                  : "Select all"}
              </button>
            </div>
            <p className="text-xs text-[var(--ink-muted)]">
              Select which stores carry this product. It will be added to each
              store&apos;s inventory.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {locations.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => toggleLocation(loc.id)}
                  className={`p-3 rounded-lg text-sm font-medium text-left transition-colors border ${
                    selectedLocIds.has(loc.id)
                      ? "bg-[#FAF7F1] border-[var(--brand-olive)] text-[var(--brand-olive-hover)]"
                      : "bg-[var(--brand-cream)] border-[var(--line)] text-[var(--brand-brown)] hover:bg-[var(--line)]"
                  }`}
                >
                  {selectedLocIds.has(loc.id) ? "✓ " : ""}
                  {loc.name}
                </button>
              ))}
            </div>

            {selectedLocIds.size > 0 && (
              <div>
                <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
                  Par Level (applied to all selected stores)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={parLevel}
                  onChange={(e) => setParLevel(e.target.value)}
                  placeholder="e.g. 2"
                  className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                />
                <p className="text-xs text-[var(--ink-muted)] mt-1">
                  You can adjust individual store par levels later from the
                  Inventory page.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Database-only explainer */}
        {mode === "database" && !existingProduct && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl p-4 text-sm">
            <p className="font-medium mb-1">Adding to Product Database</p>
            <p className="text-xs">
              This product will be saved to your tasting database without
              being added to the active menu or any store&apos;s inventory. You
              can move it to the menu later from the Product Database page.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {loading
            ? "Saving..."
            : existingProduct
            ? "Save Changes"
            : "Add Product"}
        </button>
      </form>
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createProduct, updateProduct } from "@/lib/actions/products";
import { createVendor } from "@/lib/actions/vendors";
import {
  addBottleSize as addBottleSizeAction,
  addCaseSize as addCaseSizeAction,
  addProductCategory,
} from "@/lib/actions/settings";
import { ArrowLeft, Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import {
  PRODUCT_TEMPLATES,
  CONTAINER_TYPES,
  getTemplate,
  type ProductTemplate,
} from "@/lib/product-templates";

interface Vendor {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

interface UnitOption {
  id: string;
  code: string;
  name: string;
  abbrev: string;
  measureType: string;
  canPurchase: boolean;
  canRecipe: boolean;
}

interface ExistingProduct {
  id: string;
  name: string;
  type: string;
  productType: string | null;
  vendorId: string | null;
  ingredientCategory: string | null;
  bottleSizeMl: number | null;
  casePackSize: number | null;
  bottleCostCents: number | null;
  baseUnitCode: string | null;
  countUnitCode: string | null;
  isKeyItem: boolean;
  costUpdateMethod: string;
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

export function ProductFormV2({
  vendors: initialVendors,
  locations,
  categories: initialCategories,
  units,
  existingProduct,
  mode = "menu",
}: {
  vendors: Vendor[];
  locations: Location[];
  categories: string[];
  units: UnitOption[];
  existingProduct?: ExistingProduct;
  mode?: "menu" | "database";
}) {
  const router = useRouter();

  // ===== State =====
  const existingType = existingProduct?.productType || null;
  const [selectedType, setSelectedType] = useState<string | null>(
    existingType
  );
  const [showTypeSelector, setShowTypeSelector] = useState(!existingType);

  const template = selectedType ? getTemplate(selectedType) : null;

  const [vendors, setVendors] = useState(initialVendors);
  const [categories, setCategories] = useState(initialCategories);

  // Basic fields
  const [name, setName] = useState(existingProduct?.name || "");
  const [vendorId, setVendorId] = useState(existingProduct?.vendorId || "");
  const [category, setCategory] = useState(
    existingProduct?.ingredientCategory || template?.defaultCategory || ""
  );
  const [isKeyItem, setIsKeyItem] = useState(
    existingProduct?.isKeyItem || false
  );
  const [notes, setNotes] = useState(existingProduct?.notes || "");

  // "How do you buy it?" fields
  const [containerType, setContainerType] = useState(
    existingProduct?.casePackSize && existingProduct.casePackSize > 1
      ? "case"
      : template?.defaultContainerType || "bottle"
  );
  const [unitsPerPack, setUnitsPerPack] = useState(
    existingProduct?.casePackSize?.toString() || "1"
  );
  const [innerSize, setInnerSize] = useState(
    existingProduct?.bottleSizeMl?.toString() || ""
  );
  const [innerUnitCode, setInnerUnitCode] = useState(
    template?.sizeUnit || existingProduct?.baseUnitCode || "ml"
  );
  const [costDollars, setCostDollars] = useState(
    existingProduct?.bottleCostCents
      ? (existingProduct.bottleCostCents / 100).toString()
      : ""
  );

  // Stores
  const [selectedLocIds, setSelectedLocIds] = useState<Set<string>>(
    new Set(existingProduct?.inventoryItems.map((i) => i.locationId) || [])
  );
  const [parLevel, setParLevel] = useState(
    existingProduct?.inventoryItems[0]?.parLevel?.toString() || ""
  );

  // Advanced toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Inline "New" popups
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ===== Derived =====
  const suggestedSizes = template?.suggestedSizes || [];
  const suggestedCategories = useMemo(() => {
    const all = new Set([
      ...(template?.suggestedCategories || []),
      ...categories,
    ]);
    return [...all].sort((a, b) => a.localeCompare(b));
  }, [template, categories]);

  // All purchase-enabled units, grouped by measure type for the dropdown
  const purchaseUnits = useMemo(() => {
    return units.filter((u) => u.canPurchase);
  }, [units]);

  const groupedUnits = useMemo(() => {
    const groups: Record<string, UnitOption[]> = {
      VOLUME: [],
      WEIGHT: [],
      COUNT: [],
    };
    for (const u of purchaseUnits) {
      if (groups[u.measureType]) {
        groups[u.measureType].push(u);
      }
    }
    return groups;
  }, [purchaseUnits]);

  // ===== Handlers =====
  function selectType(type: string) {
    const tpl = getTemplate(type);
    setSelectedType(type);
    setShowTypeSelector(false);
    if (tpl && !existingProduct) {
      setCategory(tpl.defaultCategory);
      setContainerType(tpl.defaultContainerType);
      setInnerUnitCode(tpl.sizeUnit);
      if (tpl.suggestedSizes.length === 1) {
        setInnerSize(tpl.suggestedSizes[0].toString());
      }
    }
  }

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
      await addProductCategory(trimmed);
    }
    setCategory(trimmed);
    setNewCategoryName("");
    setShowNewCategory(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setLoading(true);

    // Map old fields from the new form data
    const typeField =
      template?.measureType === "WEIGHT"
        ? "SOLID"
        : template?.measureType === "COUNT" &&
          selectedType !== "BEER" &&
          selectedType !== "NA_BEVERAGE"
        ? "SOLID"
        : "LIQUID";

    const bottleSizeMl =
      template?.measureType === "VOLUME" && innerSize
        ? parseInt(innerSize)
        : undefined;

    const casePackSize =
      containerType === "case" && unitsPerPack
        ? parseInt(unitsPerPack)
        : undefined;

    const bottleCostCents = costDollars
      ? Math.round(parseFloat(costDollars) * 100)
      : undefined;

    const data = {
      name,
      type: typeField,
      vendorId: vendorId || undefined,
      ingredientCategory: category || undefined,
      bottleSizeMl,
      casePackSize,
      bottleCostCents,
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
      // Also update the new fields (productType, baseUnitCode, etc.)
      // These are set via a direct update since createProduct doesn't handle them yet
      router.back();
    }
  }

  // ===== Render =====
  return (
    <div>
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-2 text-[var(--ink-muted)] hover:text-[var(--brand-brown)] mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ===== STEP 1: What is it? ===== */}
        {showTypeSelector ? (
          <div className="bg-white border border-[var(--line)] rounded-xl p-4">
            <h2 className="font-semibold mb-1">What are you adding?</h2>
            <p className="text-xs text-[var(--ink-muted)] mb-4">
              Pick a type to pre-fill smart defaults
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {PRODUCT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.type}
                  type="button"
                  onClick={() => selectType(tpl.type)}
                  className={`p-3 rounded-lg border text-left transition-colors hover:border-[var(--brand-olive)] ${
                    selectedType === tpl.type
                      ? "border-[var(--brand-olive)] bg-[#FAF7F1]"
                      : "border-[var(--line)] bg-white"
                  }`}
                >
                  <div className="text-2xl mb-1">{tpl.icon}</div>
                  <p className="font-medium text-sm">{tpl.label}</p>
                  <p className="text-xs text-[var(--ink-muted)] mt-0.5 line-clamp-2">
                    {tpl.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white border border-[var(--line)] rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{template?.icon || "📦"}</span>
                <div>
                  <p className="font-semibold">{template?.label || selectedType}</p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {template?.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTypeSelector(true)}
                className="text-xs text-[var(--brand-olive)] hover:text-[var(--brand-olive-hover)]"
              >
                Change type
              </button>
            </div>
          </div>
        )}

        {/* Only show form fields after type is selected */}
        {selectedType && (
          <>
            {/* ===== STEP 2: The Basics ===== */}
            <div className="bg-white border border-[var(--line)] rounded-xl p-4 space-y-4">
              <h2 className="font-semibold">Product Info</h2>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
                  Name *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder={`e.g. ${
                    selectedType === "SPIRIT"
                      ? "Grey Goose Vodka"
                      : selectedType === "WINE"
                      ? "Opus One 2020"
                      : selectedType === "GARNISH"
                      ? "Fresh Mint"
                      : "Product name"
                  }`}
                  className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                  autoFocus
                />
              </div>

              {/* Vendor + Category row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Vendor */}
                <div>
                  <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
                    Vendor
                  </label>
                  {!showNewVendor ? (
                    <div className="flex gap-1">
                      <select
                        value={vendorId}
                        onChange={(e) => setVendorId(e.target.value)}
                        className="flex-1 px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                      >
                        <option value="">— Select —</option>
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowNewVendor(true)}
                        className="px-2 py-2 bg-[var(--brand-cream)] hover:bg-[var(--line)] rounded-lg text-[var(--brand-brown)]"
                        title="Add new vendor"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <input
                        value={newVendorName}
                        onChange={(e) => setNewVendorName(e.target.value)}
                        placeholder="Vendor name"
                        className="flex-1 px-3 py-2 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleCreateVendor}
                        className="px-3 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm"
                      >
                        Add
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

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-[var(--brand-brown)] mb-1">
                    Category
                  </label>
                  {!showNewCategory ? (
                    <div className="flex gap-1">
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="flex-1 px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                      >
                        <option value="">— Select —</option>
                        {suggestedCategories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowNewCategory(true)}
                        className="px-2 py-2 bg-[var(--brand-cream)] hover:bg-[var(--line)] rounded-lg text-[var(--brand-brown)]"
                        title="Add new category"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <input
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Category name"
                        className="flex-1 px-3 py-2 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                        autoFocus
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
              </div>
            </div>

            {/* ===== STEP 2b: How do you buy it? ===== */}
            <div className="bg-white border border-[var(--line)] rounded-xl p-4 space-y-4">
              <h2 className="font-semibold">How do you buy it?</h2>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Container / Package type */}
                <div>
                  <label className="block text-xs text-[var(--ink-muted)] mb-1">
                    Container / Package
                  </label>
                  <select
                    value={containerType}
                    onChange={(e) => setContainerType(e.target.value)}
                    className="w-full px-2 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                  >
                    {CONTAINER_TYPES.map((ct) => (
                      <option key={ct.value} value={ct.value}>
                        {ct.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Units per pack (for cases/packs) */}
                {(containerType === "case" || containerType === "pack") && (
                  <div>
                    <label className="block text-xs text-[var(--ink-muted)] mb-1">
                      How many in {containerType === "case" ? "a case" : "a pack"}?
                    </label>
                    <select
                      value={unitsPerPack}
                      onChange={(e) => setUnitsPerPack(e.target.value)}
                      className="w-full px-2 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                    >
                      {[1, 2, 3, 4, 6, 8, 10, 12, 15, 18, 24, 30, 32, 36, 48].map(
                        (n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                )}

                {/* Cost */}
                <div>
                  <label className="block text-xs text-[var(--ink-muted)] mb-1">
                    Cost ($)
                    {containerType === "case" || containerType === "pack"
                      ? " per unit"
                      : ` per ${containerType}`}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={costDollars}
                    onChange={(e) => setCostDollars(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-2 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                  />
                </div>
              </div>

              {/* Size row: number input + unit dropdown */}
              <div>
                <label className="block text-xs text-[var(--ink-muted)] mb-1">
                  Size per unit
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={innerSize}
                    onChange={(e) => setInnerSize(e.target.value)}
                    placeholder="e.g. 750"
                    className="w-28 px-2 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                  />
                  <select
                    value={innerUnitCode}
                    onChange={(e) => setInnerUnitCode(e.target.value)}
                    className="flex-1 px-2 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                  >
                    {Object.entries(groupedUnits).map(([type, unitsList]) =>
                      unitsList.length > 0 ? (
                        <optgroup
                          key={type}
                          label={
                            type === "VOLUME"
                              ? "📐 Volume"
                              : type === "WEIGHT"
                              ? "⚖️ Weight"
                              : "🔢 Count"
                          }
                        >
                          {unitsList.map((u) => (
                            <option key={u.code} value={u.code}>
                              {u.name} ({u.abbrev})
                            </option>
                          ))}
                        </optgroup>
                      ) : null
                    )}
                  </select>
                </div>
                {/* Quick-pick chips for suggested sizes */}
                {suggestedSizes.length > 1 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-xs text-[var(--ink-muted)]">Quick:</span>
                    {suggestedSizes.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setInnerSize(s.toString())}
                        className={`px-2 py-0.5 rounded text-xs transition-colors ${
                          innerSize === s.toString()
                            ? "bg-[var(--brand-olive)] text-white"
                            : "bg-[var(--brand-cream)] text-[var(--ink-muted)] hover:bg-[var(--line)]"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Cost summary */}
              {costDollars && parseFloat(costDollars) > 0 && (
                <div className="text-xs text-[var(--ink-muted)] bg-[#FAF7F1] border border-[var(--brand-olive)] rounded-lg px-3 py-2">
                  {(containerType === "case" || containerType === "pack") &&
                  parseInt(unitsPerPack) > 1
                    ? `💰 $${costDollars}/unit × ${unitsPerPack} = $${(
                        parseFloat(costDollars) * parseInt(unitsPerPack)
                      ).toFixed(2)} per ${containerType}`
                    : `💰 $${costDollars} per ${containerType}`}
                  {innerSize &&
                    parseFloat(innerSize) > 0 &&
                    (() => {
                      const unit = purchaseUnits.find(
                        (u) => u.code === innerUnitCode
                      );
                      return unit
                        ? ` · ${innerSize} ${unit.abbrev} each`
                        : "";
                    })()}
                </div>
              )}
            </div>

            {/* ===== Stores ===== */}
            {(mode === "menu" ||
              (existingProduct && existingProduct.onMenu)) && (
              <div className="bg-white border border-[var(--line)] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Available at stores</h2>
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
                    <label className="block text-xs text-[var(--ink-muted)] mb-1">
                      Par level (all stores)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={parLevel}
                      onChange={(e) => setParLevel(e.target.value)}
                      placeholder="e.g. 2"
                      className="w-32 px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                    />
                    <p className="text-xs text-[var(--ink-muted)] mt-1">
                      Adjust per store later from Inventory
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Database mode explainer */}
            {mode === "database" && !existingProduct && (
              <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl p-4 text-sm">
                <p className="font-medium mb-1">Adding to Product Database</p>
                <p className="text-xs">
                  This product will be saved to your tasting database without
                  being added to any store. Move it to the menu later.
                </p>
              </div>
            )}

            {/* ===== Advanced (collapsible) ===== */}
            <div className="bg-white border border-[var(--line)] rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--brand-cream)] transition-colors"
              >
                <span className="text-sm font-medium text-[var(--brand-brown)]">
                  Advanced options
                </span>
                {showAdvanced ? (
                  <ChevronUp className="w-4 h-4 text-[var(--ink-muted)]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[var(--ink-muted)]" />
                )}
              </button>
              {showAdvanced && (
                <div className="px-4 pb-4 border-t border-[var(--line)] pt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-[var(--ink-muted)] mb-1">
                        Cost Update Method
                      </label>
                      <select
                        defaultValue={
                          existingProduct?.costUpdateMethod || "MANUAL"
                        }
                        className="w-full px-2 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                      >
                        <option value="MANUAL">Manual (I set the price)</option>
                        <option value="LAST_RECEIVED">
                          Last Received (auto-update from invoices)
                        </option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm text-[var(--brand-brown)]">
                        <input
                          type="checkbox"
                          checked={isKeyItem}
                          onChange={(e) => setIsKeyItem(e.target.checked)}
                          className="w-4 h-4 rounded bg-[var(--brand-cream)] border-[var(--line)] text-[var(--brand-olive)] focus:ring-[var(--brand-olive)]"
                        />
                        Key Item (track closely)
                      </label>
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs text-[var(--ink-muted)] mb-1">
                      Notes / Tasting Notes
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Tasting notes, rep info, or anything to remember"
                      className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] resize-y text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ===== Submit ===== */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-3 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {loading
                  ? "Saving..."
                  : existingProduct
                  ? "Save Changes"
                  : mode === "database"
                  ? "Add to Database"
                  : "Add Product"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

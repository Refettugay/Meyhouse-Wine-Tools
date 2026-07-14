"use client";

import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { updateProduct, moveProductToDatabase, moveProductToMenu, hardDeleteProduct, toggleMarkForRemoval, toggleProductTag, bulkAddProductsToLocation, bulkRemoveProductsFromLocation } from "@/lib/actions/products";
import { saveSingleCount, saveSinglePar, updateProductStorageArea, updateProductShelf, createStorageArea, saveInProgressOrder, submitInProgressOrders } from "@/lib/actions/inventory";
import { generateApprovedOrderEmails, sendOrderEmails, markOrdersOrdered } from "@/lib/actions/email-orders";
import { canApproveOrders } from "@/lib/permissions";
import { addBottleSize, setUseMergedOrderCart } from "@/lib/actions/settings";
import type { SubCategory } from "@/lib/category-types";
import { Mail } from "lucide-react";
import { useResizableColumns } from "@/hooks/use-resizable-columns";
import { MenuPricingReadOnly } from "@/components/product/menu-pricing-readonly";
import { AddVendorDrawer } from "@/components/vendor/add-vendor-drawer";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  MapPin,
  Package,
  ShoppingCart,
  DollarSign,
  ClipboardList,
  Undo2,
  Star,
  Archive,
  XCircle,
  FlaskConical,
  GlassWater,
  Milk,
  Grape,
  Maximize2,
  Minimize2,
  Zap,
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  type: string;
  productType: string | null;
  vendor: string | null;
  vendorId: string | null;
  ingredientCategory: string | null;
  bottleCostCents: number | null;
  bottleSizeMl: number | null;
  bottleSizeUnit: string;
  yieldCount: number | null;
  yieldUnit: string | null;
  casePackSize: number | null;
  orderUnit: string;
  onMenu: boolean;
  menuStatus: string;
  isKeyItem: boolean;
  notes: string | null;
  menuPrice: number | null;
  costTargetPct: number | null;
  costUpdateMethod: string;
  locationIds: string[];
  locationCount: number;
  inventory: {
    id: string;
    locationId: string;
    locationName: string;
    storageArea: string | null;
    shelfLocation: string | null;
    storageArea2: string | null;
    shelfLocation2: string | null;
    isBTG: boolean;
    isCraftCocktailIngredient: boolean;
    isWellSpirit: boolean;
    isHalfBottle: boolean;
    isDessertWine: boolean;
    markedForRemoval: string | null;
    parLevel: number;
    currentStock: number;
    lastCountedAt: string | null;
    purchasesSinceLastCount: number;
    orderHistory: { qty: number; date: string; weekNum: number }[];
  }[];
}

interface Location {
  id: string;
  name: string;
  storageAreas: { id: string; name: string }[];
}

interface Vendor {
  id: string;
  name: string;
}

type Mode = "products" | "inventory" | "ordering" | "pricing";
type SortField = "name" | "size" | "case" | "vendor" | "category" | "area" | "shelf" | "area2" | "shelf2" | "cost" | "pour" | "pourCost" | "suggested";
type SortDir = "asc" | "desc";

const OZ_TO_ML = 29.5735;

// Case pack size special values (stored as negative numbers so they don't clash with real counts)
const CASE_BOTTLE_ONLY = -1;  // "Bottle Only"
const CASE_SINGLE = -2;       // "Single"
const CASE_KEG = -3;          // "Keg"

function formatCaseSize(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return "—";
  if (n === CASE_BOTTLE_ONLY) return "Bottle Only";
  if (n === CASE_SINGLE) return "Single";
  if (n === CASE_KEG) return "Keg";
  return `${n}-Pack`;
}

// Short unit label for order quantity display
function orderUnitLabel(casePackSize: number | null | undefined, isCase: boolean): string {
  if (casePackSize === CASE_KEG) return "keg";
  return isCase ? "cs" : "btl";
}

// Friendly labels for container sizes
// Common weight sizes stored as grams (same field as ml for simplicity)
const WEIGHT_SIZE_OPTIONS = [
  { value: 454, label: "1lb (454g)" },
  { value: 907, label: "2lb (907g)" },
  { value: 1361, label: "3lb" },
  { value: 2268, label: "5lb" },
  { value: 4536, label: "10lb" },
  { value: 9072, label: "20lb" },
];

function formatSize(value: number, unit: string): string {
  if (unit === "g") {
    if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}kg`;
    return `${value}g`;
  }
  if (unit === "kg") return `${value}kg`;
  if (unit === "lb") {
    if (Number.isInteger(value)) return `${value}lb`;
    return `${value.toFixed(1)}lb`;
  }
  if (unit === "gal") return `${value}gal`;
  if (unit === "solid_oz") return `${value}oz (solid)`;
  // Default: ml/volume
  return formatSizeMl(value);
}

function formatSizeMl(ml: number): string {
  const NAMED_SIZES: Record<number, string> = {
    148: "5oz (148ml)",
    296: "10oz",
    325: "11oz",
    330: "330ml (11.16oz)",
    355: "355ml (12oz)",
    473: "473ml (16oz)",
    532: "18oz",
    562: "19oz",
    591: "20oz",
    1893: "64oz",
    4997: "Mini Keg (1.32gal)",
    19533: "Sixth Keg (5.16gal)",
    29337: "Quarter Keg (7.75gal)",
    58674: "Half Barrel (15.5gal)",
  };
  if (NAMED_SIZES[ml]) return NAMED_SIZES[ml];
  if (ml >= 3785) return `${(ml / 3785).toFixed(2)}gal (${ml}ml)`;
  if (ml >= 1000) return `${(ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 1)}L`;
  return `${ml}ml`;
}

// Categorize size values into groups for dropdown organization
type SizeGroup = "ml" | "oz" | "weight" | "keg";

function classifySize(ml: number): SizeGroup {
  // Named keg sizes
  if ([4997, 19533, 29337, 58674].includes(ml)) return "keg";
  // Large gallon/keg-like
  if (ml >= 3785) return "keg";
  // Named oz sizes (stored as ml equivalent but labeled as oz)
  // These are oz values: 148 (5oz), 296 (10oz), 325 (11oz), 532 (18oz), 562 (19oz), 591 (20oz), 1893 (64oz)
  if ([148, 296, 325, 532, 562, 591, 1893].includes(ml)) return "oz";
  // Named weights (grams/lbs that might be stored as ml field)
  if ([454, 907, 1361, 2268, 4536, 9072].includes(ml)) return "weight";
  return "ml";
}

function sizeGroupOrder(group: SizeGroup): number {
  return { ml: 1, oz: 2, weight: 3, keg: 4 }[group];
}

function sortBottleSizes(sizes: number[]): number[] {
  return [...sizes].sort((a, b) => {
    const ga = classifySize(a);
    const gb = classifySize(b);
    if (ga !== gb) return sizeGroupOrder(ga) - sizeGroupOrder(gb);
    return a - b;
  });
}

export function UnifiedProductsPage({
  products,
  locations,
  vendors,
  categories,
  structuredCategories,
  standardPours,
  costTargets,
  bottleSizes,
  useMergedOrderCart,
  role,
  inProgressOrders,
  theoreticalUsage,
}: {
  products: Product[];
  locations: Location[];
  vendors: Vendor[];
  categories: string[];
  structuredCategories: SubCategory[];
  standardPours: Record<string, number>;
  costTargets: Record<string, number>;
  bottleSizes: number[];
  useMergedOrderCart: boolean;
  role: string;
  inProgressOrders: {
    id: string;
    locationId: string;
    createdBy: string | null;
    createdByName: string | null;
    reviewNote: string | null;
    items: { ingredientId: string; countedStock: number | null; quantityNeeded: number; unit: string }[];
  }[];
  // Theoretical usage from POS sales, keyed `${ingredientId}_${locationId}`, in inventory count units.
  theoreticalUsage: Record<string, number>;
}) {
  const canApprove = canApproveOrders({ role });
  const router = useRouter();
  const searchParams = useSearchParams();

  // Ordering mode toggle (single vs multi-location). Optimistic local state
  // drives the control instantly; the server action persists it and
  // router.refresh() re-syncs the useMergedOrderCart prop (which the cart logic reads).
  const [mergedOptimistic, setMergedOptimistic] = useState(useMergedOrderCart);
  const [orderModePending, startOrderModeTransition] = useTransition();
  useEffect(() => {
    setMergedOptimistic(useMergedOrderCart);
  }, [useMergedOrderCart]);
  const changeOrderMode = (merged: boolean) => {
    if (merged === mergedOptimistic || orderModePending) return;
    setMergedOptimistic(merged);
    startOrderModeTransition(async () => {
      await setUseMergedOrderCart(merged);
      router.refresh();
    });
  };

  // Scroll preservation — save/restore scroll position across server action re-renders
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollPos = useRef<number>(0);
  const shouldRestoreScroll = useRef<boolean>(false);

  // Save scroll before any edit triggers a re-render
  function saveScroll() {
    if (scrollContainerRef.current) {
      savedScrollPos.current = scrollContainerRef.current.scrollTop;
      shouldRestoreScroll.current = true;
    }
  }

  // Restore scroll after re-render ONLY if saveScroll was explicitly called
  useLayoutEffect(() => {
    if (shouldRestoreScroll.current && scrollContainerRef.current) {
      const target = savedScrollPos.current;
      if (Math.abs(scrollContainerRef.current.scrollTop - target) > 2) {
        scrollContainerRef.current.scrollTop = target;
      }
      shouldRestoreScroll.current = false;
    }
  });

  // Resizable column refs and hooks
  const orderTableRef = useRef<HTMLTableElement>(null);
  const productTableRef = useRef<HTMLTableElement>(null);
  const inventoryTableRef = useRef<HTMLTableElement>(null);

  const orderResize = useResizableColumns({
    columnCount: 9,
    defaultWidths: [180, 60, 85, 50, 65, 60, 50, 65, 400],
    minWidth: 40,
    tableRef: orderTableRef,
  });

  const productResize = useResizableColumns({
    columnCount: 11,
    defaultWidths: [175, 55, 80, 85, 75, 65, 50, 60, 70, 50, 55],
    minWidth: 40,
    tableRef: productTableRef,
  });

  // Mode from URL
  const urlMode = searchParams.get("mode") as Mode | null;
  const [mode, setMode] = useState<Mode>(urlMode || "products");

  // ===== FULL SCREEN VIEW =====
  // Purely additive: when ON, collapses the surrounding chrome so the product
  // list takes over the screen. When OFF the page is identical to before.
  // Persisted per device via localStorage.
  const [fullScreenView, setFullScreenView] = useState(false);

  // Restore the saved preference on mount (guarded for SSR).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem("productHub.fullScreenView") === "1") {
        setFullScreenView(true);
      }
    } catch {}
  }, []);

  const setFullScreenViewPersisted = useCallback((v: boolean) => {
    setFullScreenView(v);
    try { localStorage.setItem("productHub.fullScreenView", v ? "1" : "0"); } catch {}
  }, []);

  // Drive the global top-nav hide via a document-level attribute + scoped CSS
  // (the top bar lives in the parent layout, outside this component). Always
  // clean up on unmount so leaving the page restores the nav.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (fullScreenView) {
      document.documentElement.setAttribute("data-fullscreen", "1");
    } else {
      document.documentElement.removeAttribute("data-fullscreen");
    }
    return () => {
      document.documentElement.removeAttribute("data-fullscreen");
    };
  }, [fullScreenView]);

  // Esc exits Full Screen View.
  useEffect(() => {
    if (!fullScreenView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullScreenViewPersisted(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullScreenView, setFullScreenViewPersisted]);

  // Filters
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [vendorFilter, setVendorFilter] = useState(searchParams.get("vendor") || "ALL");
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get("category") || "ALL");
  const [locationFilter, setLocationFilter] = useState(searchParams.get("location") || "ALL");
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") || "onMenu"
  );

  // ===== BULK SELECTION (Products mode) =====
  // Multi-select for bulk add/remove products to/from a location.
  // Lives in component state only — does NOT persist across reloads.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAddLocationId, setBulkAddLocationId] = useState<string>("");
  const [bulkAddPar, setBulkAddPar] = useState<string>("");
  const [bulkRemoveLocationId, setBulkRemoveLocationId] = useState<string>("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkBanner, setBulkBanner] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  // Clear selection whenever the user switches away from Products mode —
  // selection is meaningless outside the products table.
  useEffect(() => {
    if (mode !== "products" && selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }, [mode, selectedIds.size]);

  // Auto-dismiss the bulk action banner after a few seconds.
  useEffect(() => {
    if (!bulkBanner) return;
    const t = setTimeout(() => setBulkBanner(null), 3500);
    return () => clearTimeout(t);
  }, [bulkBanner]);
  // Sort: stored in URL params for robust navigation persistence (survives router.back())
  const [sortField, setSortFieldRaw] = useState<SortField>(() => {
    const f = searchParams.get("sort") as SortField | null;
    return f || "name";
  });
  const [sortDir, setSortDirRaw] = useState<SortDir>(() => {
    const d = searchParams.get("dir") as SortDir | null;
    return d || "asc";
  });

  const updateSortUrl = (field: SortField, dir: SortDir) => {
    const params = new URLSearchParams(searchParams.toString());
    if (field === "name" && dir === "asc") {
      params.delete("sort");
      params.delete("dir");
    } else {
      params.set("sort", field);
      params.set("dir", dir);
    }
    const url = `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`;
    window.history.replaceState(null, "", url);
  };

  const setSortField = (v: SortField) => {
    setSortFieldRaw(v);
    updateSortUrl(v, sortDir);
  };
  const setSortDir = (v: SortDir | ((prev: SortDir) => SortDir)) => {
    setSortDirRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      updateSortUrl(sortField, next);
      return next;
    });
  };

  // Persist filters to the URL (like sort) so they survive a router.back()
  // round-trip from the edit page, which unmounts and re-initializes this
  // component from the URL. Reads the live URL so changing one filter never
  // clobbers another (or the sort) that was already written.
  const updateFilterUrl = (key: string, value: string, defaultValue: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value === defaultValue) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const url = `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`;
    window.history.replaceState(null, "", url);
  };

  const setSearchPersisted = (v: string) => {
    setSearch(v);
    updateFilterUrl("search", v, "");
  };
  const setVendorFilterPersisted = (v: string) => {
    setVendorFilter(v);
    updateFilterUrl("vendor", v, "ALL");
  };
  const setCategoryFilterPersisted = (v: string) => {
    setCategoryFilter(v);
    updateFilterUrl("category", v, "ALL");
  };
  const setLocationFilterPersisted = (v: string) => {
    setLocationFilter(v);
    updateFilterUrl("location", v, "ALL");
  };
  const setStatusFilterPersisted = (v: string) => {
    setStatusFilter(v);
    updateFilterUrl("status", v, "onMenu");
  };

  // Restore scroll + highlight from sessionStorage on mount (sort is in URL, no restoration needed)
  useEffect(() => {
    try {
      const savedHighlight = sessionStorage.getItem("meyhouse_productHighlight");
      if (savedHighlight) setHighlightedRow(savedHighlight);
      const savedScroll = sessionStorage.getItem("meyhouse_productScroll");
      if (savedScroll) {
        const pos = parseInt(savedScroll);
        if (pos > 0) {
          // Multiple retries — content height grows as data loads
          [0, 50, 150, 300, 500, 800, 1200].forEach((delay) => {
            setTimeout(() => {
              if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = pos;
            }, delay);
          });
        }
      }
    } catch {}
  }, []);

  // Also restore scroll when the page becomes visible again (e.g. returning via router.back())
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== "visible") return;
      try {
        const savedScroll = sessionStorage.getItem("meyhouse_productScroll");
        if (!savedScroll) return;
        const pos = parseInt(savedScroll);
        if (pos > 0 && scrollContainerRef.current) {
          [0, 50, 200, 500].forEach((delay) => {
            setTimeout(() => {
              if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = pos;
            }, delay);
          });
        }
      } catch {}
    };
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("pageshow", handler);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("pageshow", handler);
    };
  }, []);

  // Persist scroll position on scroll (throttled) so it survives navigation
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        try { sessionStorage.setItem("meyhouse_productScroll", String(el.scrollTop)); } catch {}
      }, 150);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => {
      el.removeEventListener("scroll", handler);
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  // Inline editing state
  // Highlighted row — persisted to sessionStorage for navigation survival
  const [highlightedRow, setHighlightedRowRaw] = useState<string | null>(null);
  const setHighlightedRow = (v: string | null) => {
    setHighlightedRowRaw(v);
    try {
      if (v) sessionStorage.setItem("meyhouse_productHighlight", v);
      else sessionStorage.removeItem("meyhouse_productHighlight");
    } catch {}
  };

  // Floating mini edit toolbar (Word-style context popup near clicked row)
  const [floatingEditProductId, setFloatingEditProductId] = useState<string | null>(null);
  const [floatingEditPos, setFloatingEditPos] = useState<{ top: number; left: number } | null>(null);
  const [parDraft, setParDraft] = useState<Record<string, string>>({}); // locationId → par value being edited
  const [selectedLocationsDraft, setSelectedLocationsDraft] = useState<string[]>([]); // store ids assigned to product

  function openFloatingEdit(productId: string, rowEl: HTMLElement) {
    const rect = rowEl.getBoundingClientRect();
    setFloatingEditProductId(productId);
    // Position: right-aligned to row, just above it
    setFloatingEditPos({ top: rect.top - 8, left: Math.min(rect.right - 320, window.innerWidth - 340) });
    // Initialize drafts from current values
    const product = products.find((p) => p.id === productId);
    if (product) {
      const draft: Record<string, string> = {};
      for (const inv of product.inventory) draft[inv.locationId] = String(inv.parLevel);
      setParDraft(draft);
      setSelectedLocationsDraft(product.locationIds);
    }
  }

  function closeFloatingEdit() {
    setFloatingEditProductId(null);
    setFloatingEditPos(null);
    setParDraft({});
    setSelectedLocationsDraft([]);
  }

  async function saveFloatingParChanges() {
    const product = products.find((p) => p.id === floatingEditProductId);
    if (!product) { closeFloatingEdit(); return; }
    saveScroll();

    // Check if store assignments changed
    const currentLocIds = new Set(product.locationIds);
    const newLocIds = new Set(selectedLocationsDraft);
    const storesChanged = currentLocIds.size !== newLocIds.size
      || [...currentLocIds].some((id) => !newLocIds.has(id))
      || [...newLocIds].some((id) => !currentLocIds.has(id));

    // Collect par changes (only for stores still assigned after changes)
    const parUpdates: { invId: string; par: number }[] = [];
    for (const inv of product.inventory) {
      if (!newLocIds.has(inv.locationId)) continue; // skip stores being removed
      const newVal = parDraft[inv.locationId];
      if (newVal === undefined) continue;
      const parsed = parseFloat(newVal);
      if (!isNaN(parsed) && parsed >= 0 && parsed !== inv.parLevel) {
        parUpdates.push({ invId: inv.id, par: parsed });
      }
    }

    try {
      // If stores changed, update product with new locationIds (handles add/remove)
      if (storesChanged) {
        // Par level for newly-added stores: use average of existing par values (or the value from parDraft)
        const avgPar = product.inventory.length > 0
          ? product.inventory.reduce((sum, inv) => sum + inv.parLevel, 0) / product.inventory.length
          : 0;
        await updateProduct(product.id, {
          name: product.name,
          type: product.type,
          vendorId: product.vendorId || undefined,
          ingredientCategory: product.ingredientCategory || undefined,
          bottleSizeMl: product.bottleSizeMl || undefined,
          bottleSizeUnit: product.bottleSizeUnit || "ml",
          yieldCount: product.yieldCount ?? null,
          yieldUnit: product.yieldUnit ?? null,
          casePackSize: product.casePackSize || undefined,
          bottleCostCents: product.bottleCostCents || undefined,
          locationIds: selectedLocationsDraft,
          parLevel: avgPar,
        });
      }
      // Apply par updates (for existing stores)
      await Promise.all(parUpdates.map((u) => saveSinglePar(u.invId, u.par)));
    } catch (e) {
      console.error("Floating edit save failed:", e);
      setMarkerError("Failed to save changes.");
    }
    closeFloatingEdit();
  }

  // Click outside or Escape closes the floating edit
  useEffect(() => {
    if (!floatingEditProductId) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("[data-floating-edit]")) return;
      // Clicking same row that's already highlighted? don't close (user may just click around)
      saveFloatingParChanges();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeFloatingEdit();
    }
    // Delay listener so the current click doesn't immediately close it
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onClickOutside);
    }, 50);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatingEditProductId, parDraft]);
  const [markerError, setMarkerError] = useState<string>("");

  // Custom size entry mode
  const [customSizeMode, setCustomSizeMode] = useState(false);
  const [customSizeValue, setCustomSizeValue] = useState("");
  const [customSizeUnit, setCustomSizeUnit] = useState<string>("ml");
  const [customSizeProductId, setCustomSizeProductId] = useState<string>("");

  // Custom case input mode
  const [customCaseMode, setCustomCaseMode] = useState(false);
  const [customCaseProductId, setCustomCaseProductId] = useState<string>("");
  const [customCaseValue, setCustomCaseValue] = useState("");

  function saveCustomSize() {
    const num = parseFloat(customSizeValue);
    if (isNaN(num) || num <= 0) {
      setCustomSizeMode(false);
      setEditingCell(null);
      return;
    }
    // For weight units, store the raw value + unit. For volume, convert to ml.
    const weightUnits = ["g", "kg", "lb", "solid_oz"];
    const isWeight = weightUnits.includes(customSizeUnit);
    let storeValue: number;
    let storeUnit: string;
    if (isWeight) {
      // Store raw value in the unit's base (g for g/kg, raw for lb)
      if (customSizeUnit === "kg") { storeValue = Math.round(num * 1000); storeUnit = "g"; }
      else if (customSizeUnit === "lb") { storeValue = Math.round(num * 100) / 100; storeUnit = "lb"; }
      else if (customSizeUnit === "solid_oz") { storeValue = Math.round(num * 100) / 100; storeUnit = "solid_oz"; }
      else { storeValue = Math.round(num); storeUnit = "g"; }
    } else {
      const toMl: Record<string, number> = { ml: 1, oz: OZ_TO_ML, gal: 3785.41 };
      storeValue = Math.round(num * (toMl[customSizeUnit] || 1));
      storeUnit = "ml";
    }
    saveScroll();
    setEditingCell(null);
    setCustomSizeMode(false);
    const product = products.find((pr) => pr.id === customSizeProductId);
    if (product) {
      if (storeUnit === "ml") addBottleSize(storeValue);
      updateProduct(customSizeProductId, {
        name: product.name, type: product.type,
        vendorId: product.vendorId || undefined,
        ingredientCategory: product.ingredientCategory || undefined,
        bottleSizeMl: storeValue,
        bottleSizeUnit: storeUnit,
        casePackSize: product.casePackSize || undefined,
        bottleCostCents: product.bottleCostCents || undefined,
        locationIds: product.locationIds,
      });
    }
  }

  // Track which pour size index is selected per product (persisted to localStorage)
  const [selectedPourIdx, setSelectedPourIdxRaw] = useState<Record<string, number>>({});
  const pourIdxLoaded = useRef(false);
  useEffect(() => {
    if (!pourIdxLoaded.current) {
      pourIdxLoaded.current = true;
      try {
        const saved = JSON.parse(localStorage.getItem("meyhouse_selectedPourIdx") || "{}");
        if (Object.keys(saved).length > 0) setSelectedPourIdxRaw(saved);
      } catch {}
    }
  }, []);
  function setSelectedPourIdx(val: Record<string, number>) {
    setSelectedPourIdxRaw(val);
    try { localStorage.setItem("meyhouse_selectedPourIdx", JSON.stringify(val)); } catch {}
  }
  const [pourDropdownOpen, setPourDropdownOpen] = useState<string | null>(null);

  const [editingCell, setEditingCell] = useState<{
    productId: string;
    field: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [removeMenuOpen, setRemoveMenuOpen] = useState<string | null>(null);

  // Local copy of vendors so a vendor created via the "+ Add new vendor…"
  // drawer shows in the dropdowns immediately, before the server revalidates.
  const [vendorList, setVendorList] = useState(vendors);
  useEffect(() => { setVendorList(vendors); }, [vendors]);
  // Product id the Add-Vendor drawer should assign to; drawer open when set.
  const [addVendorFor, setAddVendorFor] = useState<string | null>(null);

  // Inventory mode state
  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    searchParams.get("store") || ""
  );
  const [inventoryCounts, setInventoryCounts] = useState<
    Record<string, string>
  >({});
  const [savedItems, setSavedItems] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );

  // Area filter for ordering/inventory modes
  const [selectedArea, setSelectedArea] = useState<string>("ALL");

  // Ordering/Inventory sort state
  type OrderSortField = "name" | "size" | "vendor" | "area" | "par" | "count" | "need" | "order";
  const [orderSortField, setOrderSortField] = useState<OrderSortField>("name");
  const [orderSortDir, setOrderSortDir] = useState<SortDir>("asc");

  function toggleOrderSort(field: OrderSortField) {
    if (orderSortField === field) {
      setOrderSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setOrderSortField(field);
      setOrderSortDir("asc");
    }
  }

  function OrderSortIcon({ field }: { field: OrderSortField }) {
    if (orderSortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return orderSortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  }

  function toggleGroup(groupName: string) {
    const newSet = new Set(collapsedGroups);
    if (newSet.has(groupName)) newSet.delete(groupName);
    else newSet.add(groupName);
    setCollapsedGroups(newSet);
  }

  // Get inventory items for selected store, grouped by storage area
  const inventoryForStore = useMemo(() => {
    if (!selectedStoreId) return [];
    return products
      .filter((p) => p.onMenu && p.locationIds.includes(selectedStoreId))
      .map((p) => {
        const inv = p.inventory.find(
          (i) => i.locationId === selectedStoreId
        );
        return inv ? { ...p, inv } : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => {
        const aArea = a.inv.storageArea || "zzz_Unassigned";
        const bArea = b.inv.storageArea || "zzz_Unassigned";
        if (aArea !== bArea) return aArea.localeCompare(bArea);
        return a.name.localeCompare(b.name);
      });
  }, [products, selectedStoreId]);

  const inventoryGrouped = useMemo(() => {
    const groups = new Map<
      string,
      (typeof inventoryForStore)[number][]
    >();
    for (const item of inventoryForStore) {
      const area = item.inv.storageArea || "Unassigned";
      if (!groups.has(area)) groups.set(area, []);
      groups.get(area)!.push(item);
    }
    return [...groups.entries()].map(([name, items]) => ({
      name,
      items,
    }));
  }, [inventoryForStore]);

  // List of area names for filter buttons
  const areaNames = useMemo(() => inventoryGrouped.map((g) => g.name), [inventoryGrouped]);

  const countedCount = Object.values(inventoryCounts).filter(
    (v) => v !== ""
  ).length;

  async function handleCountSave(inventoryItemId: string, value: string) {
    const count = parseFloat(value);
    if (isNaN(count) || count < 0) return;
    saveScroll();
    await saveSingleCount(inventoryItemId, count);
    setSavedItems((prev) => new Set(prev).add(inventoryItemId));
  }

  async function handleParSave(inventoryItemId: string, value: string) {
    const par = parseFloat(value);
    if (isNaN(par) || par < 0) return;
    saveScroll();
    await saveSinglePar(inventoryItemId, par);
  }

  // ===== ORDERING MODE STATE =====
  // Load counts + overrides from localStorage so they persist across page navigation
  const [orderCounts, setOrderCountsRaw] = useState<Record<string, string>>({});
  const [showCart, setShowCart] = useState(false);
  const [cartOverrides, setCartOverridesRaw] = useState<
    Record<string, { orderQty?: number; orderUnit?: string; locationId?: string; locationName?: string }>
  >({});
  const [editingCartItem, setEditingCartItem] = useState<string | null>(null);
  const cartLoaded = useRef(false);
  useEffect(() => {
    if (!cartLoaded.current) {
      cartLoaded.current = true;
      let localCounts: Record<string, string> = {};
      try {
        localCounts = JSON.parse(localStorage.getItem("meyhouse_orderCounts") || "{}");
        if (Object.keys(localCounts).length > 0) setOrderCountsRaw(localCounts);
      } catch {}
      try {
        const overrides = JSON.parse(localStorage.getItem("meyhouse_cartOverrides") || "{}");
        if (Object.keys(overrides).length > 0) setCartOverridesRaw(overrides);
      } catch {}

      // Hydrate from the shared IN_PROGRESS orders (requirement 1) when there's
      // no local draft yet — so reopening the tab (same or different user)
      // resumes the saved order. Counts are keyed by inventoryItem id, so map
      // each order item's ingredient+location back to its inventory row.
      if (Object.keys(localCounts).length === 0 && inProgressOrders.length > 0) {
        const invIdByKey = new Map<string, string>();
        for (const p of products) {
          for (const inv of p.inventory) invIdByKey.set(`${p.id}_${inv.locationId}`, inv.id);
        }
        const seeded: Record<string, string> = {};
        for (const order of inProgressOrders) {
          for (const it of order.items) {
            const invId = invIdByKey.get(`${it.ingredientId}_${order.locationId}`);
            if (invId && it.countedStock !== null && it.countedStock !== undefined) {
              seeded[invId] = String(it.countedStock);
            }
          }
        }
        if (Object.keys(seeded).length > 0) {
          setOrderCountsRaw(seeded);
          try { localStorage.setItem("meyhouse_orderCounts", JSON.stringify(seeded)); } catch {}
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wrapper functions that save to localStorage on every change
  function setOrderCounts(val: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) {
    setOrderCountsRaw((prev) => {
      const next = typeof val === "function" ? val(prev) : val;
      try { localStorage.setItem("meyhouse_orderCounts", JSON.stringify(next)); } catch {}
      return next;
    });
  }
  function setCartOverrides(val: Record<string, { orderQty?: number; orderUnit?: string; locationId?: string; locationName?: string }>) {
    setCartOverridesRaw(val);
    try { localStorage.setItem("meyhouse_cartOverrides", JSON.stringify(val)); } catch {}
  }

  // Flat sorted list of inventory items (for ordering/inventory — no group headers)
  const flatInventoryItems = useMemo(() => {
    let items: (typeof inventoryForStore)[number][];
    if (selectedArea === "ALL") {
      items = [...inventoryForStore];
    } else {
      items = inventoryForStore.filter(
        (i) => (i.inv.storageArea || "Unassigned") === selectedArea
      );
    }
    const dir = orderSortDir === "asc" ? 1 : -1;
    items.sort((a, b) => {
      switch (orderSortField) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "size":
          return ((a.bottleSizeMl || 0) - (b.bottleSizeMl || 0)) * dir;
        case "vendor":
          return (a.vendor || "").localeCompare(b.vendor || "") * dir;
        case "area":
          return (a.inv.storageArea || "").localeCompare(b.inv.storageArea || "") * dir;
        case "par":
          return (a.inv.parLevel - b.inv.parLevel) * dir;
        case "count": {
          const aC = parseFloat(orderCounts[a.inv.id] ?? "") || 0;
          const bC = parseFloat(orderCounts[b.inv.id] ?? "") || 0;
          return (aC - bC) * dir;
        }
        case "need": {
          const aCnt = orderCounts[a.inv.id] !== undefined && orderCounts[a.inv.id] !== "" ? parseFloat(orderCounts[a.inv.id]) || 0 : null;
          const bCnt = orderCounts[b.inv.id] !== undefined && orderCounts[b.inv.id] !== "" ? parseFloat(orderCounts[b.inv.id]) || 0 : null;
          const aN = aCnt !== null ? Math.max(0, a.inv.parLevel - aCnt) : -1;
          const bN = bCnt !== null ? Math.max(0, b.inv.parLevel - bCnt) : -1;
          return (aN - bN) * dir;
        }
        case "order": {
          const getOQ = (item: typeof a) => {
            const cv = orderCounts[item.inv.id] ?? "";
            if (cv === "") return -1;
            const counted = parseFloat(cv) || 0;
            const needed = Math.max(0, item.inv.parLevel - counted);
            if (needed <= 0) return 0;
            const cps = item.casePackSize || 0;
            const isCase = cps > 1;
            const casePack = isCase ? cps : 1;
            return isCase ? Math.ceil(needed / casePack) : Math.ceil(needed);
          };
          return (getOQ(a) - getOQ(b)) * dir;
        }
        default:
          return a.name.localeCompare(b.name) * dir;
      }
    });
    return items;
  }, [inventoryForStore, selectedArea, orderSortField, orderSortDir, orderCounts]);

  // Cart items: auto-calculated from orderCounts where count < par
  interface CartItem {
    productId: string;
    productName: string;
    vendor: string;
    locationId: string;
    locationName: string;
    parLevel: number;
    counted: number;
    needed: number;
    orderQty: number;
    orderUnit: string;
    casePackSize: number;
    bottleCostCents: number | null;
  }

  const cartItems = useMemo<CartItem[]>(() => {
    const items: CartItem[] = [];

    // In merged mode: scan ALL stores' inventory items for counts below par
    // In single mode: only scan the currently selected store
    const productsToScan = useMergedOrderCart
      ? products.filter((p) => p.onMenu && p.inventory.length > 0)
      : (selectedStoreId ? inventoryForStore : []);

    for (const p of productsToScan) {
      // In merged mode, check each store this product is at
      const invEntries = useMergedOrderCart
        ? p.inventory
        : ((p as any).inv ? [(p as any).inv] : p.inventory.filter((i: any) => i.locationId === selectedStoreId));

      for (const inv of invEntries) {
        const countVal = orderCounts[inv.id];
        if (countVal === undefined || countVal === "") continue;
        const counted = parseFloat(countVal) || 0;
        const needed = inv.parLevel - counted;
        if (needed <= 0) continue;

        const cps = p.casePackSize || 0;
        const isCase = cps > 1;
        const casePack = isCase ? cps : 1;
        const orderQty = isCase ? Math.ceil(needed / casePack) : Math.ceil(needed);

        const loc = locations.find((l) => l.id === inv.locationId);
        items.push({
          productId: p.id,
          productName: p.name,
          vendor: p.vendor || "No Vendor",
          locationId: inv.locationId,
          locationName: loc?.name?.replace("Meyhouse ", "") || "",
          parLevel: inv.parLevel,
          counted,
          needed,
          orderQty,
          orderUnit: isCase ? "case" : "bottle",
          casePackSize: casePack,
          bottleCostCents: p.bottleCostCents,
        });
      }
    }
    // Apply cart overrides
    return items.map((item) => {
      const key = `${item.productId}_${item.locationId}`;
      const override = cartOverrides[key];
      if (!override) return item;
      return {
        ...item,
        orderQty: override.orderQty ?? item.orderQty,
        orderUnit: override.orderUnit ?? item.orderUnit,
        locationId: override.locationId ?? item.locationId,
        locationName: override.locationName ?? item.locationName,
      };
    });
  }, [products, inventoryForStore, orderCounts, selectedStoreId, locations, useMergedOrderCart, cartOverrides]);

  // Group cart by vendor → then by store
  const cartGrouped = useMemo(() => {
    const map = new Map<string, CartItem[]>();
    for (const item of cartItems) {
      if (!map.has(item.vendor)) map.set(item.vendor, []);
      map.get(item.vendor)!.push(item);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [cartItems]);

  const cartTotal = cartItems.reduce((sum, item) => {
    if (!item.bottleCostCents) return sum;
    const unitCost = item.orderUnit === "case"
      ? item.bottleCostCents * item.casePackSize
      : item.bottleCostCents;
    return sum + (unitCost * item.orderQty) / 100;
  }, 0);

  function removeFromCart(productId: string, locationId?: string) {
    const newCounts = { ...orderCounts };
    // Find the product across ALL locations (not just selected store)
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    // If locationId provided, remove only that store's entry; otherwise remove all locations
    const invs = locationId
      ? product.inventory.filter((i) => i.locationId === locationId)
      : product.inventory;
    for (const inv of invs) {
      // Set count to par so "need" becomes 0 → item drops from cart
      newCounts[inv.id] = inv.parLevel.toString();
    }
    setOrderCounts(newCounts);
  }


  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [emailPreviews, setEmailPreviews] = useState<any[]>([]);
  const [emailOrderListIds, setEmailOrderListIds] = useState<string[]>([]);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailResult, setEmailResult] = useState<any>(null);

  // Owner/admin only: preview vendor emails built from APPROVED orders
  // (requirement 3). Transferred lines are already merged into the receiving
  // store and combined, so the vendor never sees the transfer.
  async function handleEmailPreview() {
    setEmailLoading(true);
    setEmailResult(null);
    setShowCart(true); // the email modal renders inside the cart panel
    const result = await generateApprovedOrderEmails();
    setEmailLoading(false);
    if ((result as any)?.error) {
      setEmailResult({ results: [{ vendor: "—", status: "FAILED", error: (result as any).error }] });
    }
    setEmailPreviews(result.emails || []);
    setEmailOrderListIds((result as any).orderListIds || []);
    setShowEmailPreview(true);
  }

  async function handleSendEmails() {
    setSendingEmails(true);
    const result = await sendOrderEmails(emailPreviews);
    // Move the approved orders to ORDERED now that they've been emailed.
    if (emailOrderListIds.length > 0) await markOrdersOrdered(emailOrderListIds);
    setSendingEmails(false);
    setEmailResult(result);
  }

  function handleClearCart() {
    setOrderCounts({});
    setCartOverrides({});
    setSubmitResult(null);
    try {
      localStorage.removeItem("meyhouse_orderCounts");
      localStorage.removeItem("meyhouse_cartOverrides");
    } catch {}
  }

  // ===== AUTO-SAVE TO SHARED IN_PROGRESS ORDER (requirement 1) =====
  // As the manager builds the order, debounce-persist the cart to the DB (one
  // IN_PROGRESS order per location). This survives a tab close and lets another
  // user in the org resume the order.
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSavedLocs = useRef<Set<string>>(new Set());
  const skipFirstAutosave = useRef(true);

  // Group the current cart into per-location payloads for saveInProgressOrder.
  const buildLocationPayloads = useCallback(() => {
    const byLoc = new Map<string, { ingredientId: string; vendor: string | null; countedStock: number | null; parSnapshot: number | null; quantityNeeded: number; unit: string }[]>();
    for (const ci of cartItems) {
      if (!byLoc.has(ci.locationId)) byLoc.set(ci.locationId, []);
      byLoc.get(ci.locationId)!.push({
        ingredientId: ci.productId,
        vendor: ci.vendor === "No Vendor" ? null : ci.vendor,
        countedStock: ci.counted,
        parSnapshot: ci.parLevel,
        quantityNeeded: ci.orderQty,
        unit: ci.orderUnit,
      });
    }
    return byLoc;
  }, [cartItems]);

  // Save all current locations (and clear any location that dropped out of the
  // cart since the last save). Returns the saved order ids.
  const saveAllInProgress = useCallback(async (): Promise<string[]> => {
    const byLoc = buildLocationPayloads();
    const ids: string[] = [];
    const currentLocs = new Set(byLoc.keys());
    // Locations that had a saved order but are now empty → delete (empty items).
    for (const loc of prevSavedLocs.current) {
      if (!currentLocs.has(loc)) {
        await saveInProgressOrder({ locationId: loc, items: [] });
      }
    }
    for (const [locationId, items] of byLoc) {
      const res = await saveInProgressOrder({ locationId, items });
      if (res?.success && res.orderListId) ids.push(res.orderListId);
    }
    prevSavedLocs.current = currentLocs;
    return ids;
  }, [buildLocationPayloads]);

  useEffect(() => {
    if (mode !== "ordering") return;
    // Don't autosave the very first render (we may have just hydrated).
    if (skipFirstAutosave.current) {
      skipFirstAutosave.current = false;
      return;
    }
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveAllInProgress().catch((e) => console.error("Auto-save failed:", e));
    }, 1500);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [cartItems, mode, saveAllInProgress]);

  // Flush a pending save when the tab is hidden/closed so work isn't lost.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") {
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
        saveAllInProgress().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [saveAllInProgress]);

  // ===== SUBMIT FOR APPROVAL (requirement 2) =====
  async function handleSubmitForApproval() {
    if (cartItems.length === 0) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const ids = await saveAllInProgress();
      if (ids.length === 0) {
        setSubmitResult({ kind: "error", text: "Nothing to submit." });
        setSubmitting(false);
        return;
      }
      const res = await submitInProgressOrders(ids);
      if (res?.success) {
        setSubmitResult({ kind: "success", text: `Submitted ${res.submitted} order${res.submitted === 1 ? "" : "s"} for approval.` });
        prevSavedLocs.current = new Set();
        handleClearCart();
      } else {
        setSubmitResult({ kind: "error", text: res?.errors?.[0] || "Failed to submit." });
      }
    } catch (e) {
      console.error("Submit failed:", e);
      setSubmitResult({ kind: "error", text: "Failed to submit for approval." });
    }
    setSubmitting(false);
  }

  // Get order history helper
  function getHistoryLine(p: typeof inventoryForStore[number]): {
    weekly: number[];
    weeklyAvg: number;
    monthlyAvg: number;
  } {
    const history = p.inv.orderHistory || [];
    // Build weekly buckets (0 = this week, 1 = last week, etc.)
    const weekly = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const h of history) {
      if (h.weekNum >= 0 && h.weekNum < 8) {
        weekly[h.weekNum] += h.qty;
      }
    }
    const total = weekly.reduce((s, w) => s + w, 0);
    const weeklyAvg = total / 8;
    const monthlyAvg = weeklyAvg * 4.33;
    return { weekly: weekly.reverse(), weeklyAvg, monthlyAvg };
  }

  // Derived
  const allVendors = useMemo(
    () =>
      [...new Set(products.map((p) => p.vendor).filter(Boolean))].sort() as string[],
    [products]
  );

  // Build a lookup map: category name → structured data
  const categoryMap = useMemo(() => {
    const map = new Map<string, SubCategory>();
    for (const cat of structuredCategories) {
      map.set(cat.name, cat);
    }
    return map;
  }, [structuredCategories]);

  // (Weight sizes handled via Custom size option in dropdown)

  // Build parent name set for fallback checks
  const parentNames = useMemo(() => {
    const names = new Set<string>();
    // Parent categories that have NONE serving style shouldn't show pour sizes
    // We infer from sub-categories: if a parent name matches the ingredientCategory, treat as NONE
    return names;
  }, []);

  // Pour cost calculation — now uses structured categories
  function getCategoryData(p: Product): SubCategory | null {
    if (!p.ingredientCategory) return null;
    const sub = categoryMap.get(p.ingredientCategory);
    if (sub) return sub;
    // Fallback: if category name matches a parent name, create a virtual sub with NONE
    // This handles products still assigned to "Grocery" instead of "Grocery - Canned"
    const NON_POUR_PARENTS = ["Grocery", "Produce", "Meat & Seafood", "Dairy", "Dry Goods", "Other"];
    if (NON_POUR_PARENTS.includes(p.ingredientCategory)) {
      return { name: p.ingredientCategory, parent: p.ingredientCategory, servingStyle: "NONE", pourSizes: [] };
    }
    return null;
  }

  function getPourSize(p: Product): number {
    // 1. Check structured category pour sizes
    const catData = getCategoryData(p);
    if (catData) {
      if (catData.servingStyle === "BTB" || catData.servingStyle === "NONE") return 0;
      if (catData.pourSizes.length > 0) {
        // Use first non-zero pour size as the primary (convert to oz)
        const primary = catData.pourSizes.find((ps) => (ps.amount ?? (ps as any).oz ?? 0) > 0);
        if (primary) {
          const amt = primary.amount ?? (primary as any).oz ?? 0;
          const unit = primary.unit || "oz";
          if (unit === "ml") return Math.round((amt / OZ_TO_ML) * 100) / 100;
          return amt; // oz, dash, etc.
        }
      }
    }
    // 2. Fallback to old standardPours by productType
    if (p.productType) return standardPours[p.productType] ?? 1.5;
    return 1.5;
  }

  function getPourCostCents(p: Product): number {
    if (!p.bottleCostCents || !p.bottleSizeMl) return 0;
    const catData = getCategoryData(p);
    // BTB items: no pour cost — they're sold by the bottle
    if (catData?.servingStyle === "BTB") return 0;
    const bottleSizeOz = p.bottleSizeMl / OZ_TO_ML;
    if (bottleSizeOz <= 0) return 0;
    const costPerOz = p.bottleCostCents / bottleSizeOz;
    const pourOz = getPourSize(p);
    return Math.round(costPerOz * pourOz);
  }

  // Calculate pour cost for a specific pour size entry
  function getPourCostForSize(p: Product, ps: { amount?: number; oz?: number; unit?: string }): number {
    if (!p.bottleCostCents || !p.bottleSizeMl) return 0;
    const amt = ps.amount ?? (ps as any).oz ?? 0;
    if (amt === 0) return p.bottleCostCents; // full container = bottle cost
    const unit = ps.unit || "oz";
    let pourOzVal = amt;
    if (unit === "ml") pourOzVal = amt / OZ_TO_ML;
    else if (unit === "dash") pourOzVal = amt * (1 / OZ_TO_ML); // ~1ml per dash
    const bottleSizeOz = p.bottleSizeMl / OZ_TO_ML;
    if (bottleSizeOz <= 0) return 0;
    const costPerOz = p.bottleCostCents / bottleSizeOz;
    return Math.round(costPerOz * pourOzVal);
  }

  function getSuggestedForCost(pourCostCents: number, p: Product): number {
    if (pourCostCents <= 0) return 0;
    const targetPct =
      p.costTargetPct ||
      (p.ingredientCategory ? costTargets[p.ingredientCategory] : null) ||
      20;
    if (targetPct <= 0) return 0;
    const raw = pourCostCents / (targetPct / 100);
    return Math.round(raw / 50) * 50;
  }

  function getSuggestedPriceCents(p: Product): number {
    const catData = getCategoryData(p);
    // BTB items: suggest price from bottle cost
    if (catData?.servingStyle === "BTB") {
      if (!p.bottleCostCents) return 0;
      const targetPct =
        p.costTargetPct ||
        (p.ingredientCategory ? costTargets[p.ingredientCategory] : null) ||
        20;
      if (targetPct <= 0) return 0;
      const raw = p.bottleCostCents / (targetPct / 100);
      return Math.round(raw / 50) * 50;
    }
    const pourCost = getPourCostCents(p);
    if (pourCost <= 0) return 0;
    // Use product-level override, then category target, then default 20%
    const targetPct =
      p.costTargetPct ||
      (p.ingredientCategory ? costTargets[p.ingredientCategory] : null) ||
      20;
    if (targetPct <= 0) return 0;
    const raw = pourCost / (targetPct / 100);
    return Math.round(raw / 50) * 50; // round to nearest $0.50
  }

  // Filter + Sort
  const filtered = useMemo(() => {
    return products
      .filter((p) => {
        // Status filter
        if (statusFilter === "onMenu" && p.menuStatus !== "ON_MENU") return false;
        if (statusFilter === "database" && p.menuStatus !== "DATABASE") return false;
        if (statusFilter === "inactive" && p.menuStatus !== "INACTIVE") return false;
        // Phasing Out review list: on-menu items flagged "Mark to Remove" in the
        // currently-scoped store(s). Out-of-stock ones are the ones awaiting a decision.
        if (statusFilter === "pending") {
          if (p.menuStatus !== "ON_MENU") return false;
          const invs = locationFilter === "ALL" ? p.inventory : p.inventory.filter((i) => i.locationId === locationFilter);
          if (!invs.some((i) => i.markedForRemoval === "PENDING")) return false;
        }
        // Search
        if (search && !p.name.toLowerCase().includes(search.toLowerCase()))
          return false;
        // Vendor
        if (vendorFilter !== "ALL" && p.vendor !== vendorFilter) return false;
        // Category
        if (
          categoryFilter !== "ALL" &&
          p.ingredientCategory !== categoryFilter
        )
          return false;
        // Location
        if (
          locationFilter !== "ALL" &&
          !p.locationIds.includes(locationFilter)
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        // In the Phasing Out review list, float items that have run out (awaiting a
        // decision) to the top, regardless of the chosen sort column.
        if (statusFilter === "pending") {
          const outScope = (p: Product) => {
            const invs = locationFilter === "ALL" ? p.inventory : p.inventory.filter((i) => i.locationId === locationFilter);
            return invs.some((i) => i.markedForRemoval === "PENDING" && i.currentStock <= 0);
          };
          const aOut = outScope(a) ? 1 : 0;
          const bOut = outScope(b) ? 1 : 0;
          if (aOut !== bOut) return bOut - aOut;
        }
        switch (sortField) {
          case "name":
            return a.name.localeCompare(b.name) * dir;
          case "vendor":
            return (a.vendor || "").localeCompare(b.vendor || "") * dir;
          case "category":
            return (a.ingredientCategory || "").localeCompare(
              b.ingredientCategory || ""
            ) * dir;
          case "size":
            return ((a.bottleSizeMl || 0) - (b.bottleSizeMl || 0)) * dir;
          case "case":
            return ((a.casePackSize || 0) - (b.casePackSize || 0)) * dir;
          case "area": {
            const aInv = locationFilter === "ALL" ? a.inventory[0] : a.inventory.find((i) => i.locationId === locationFilter) || a.inventory[0];
            const bInv = locationFilter === "ALL" ? b.inventory[0] : b.inventory.find((i) => i.locationId === locationFilter) || b.inventory[0];
            return (aInv?.storageArea || "").localeCompare(bInv?.storageArea || "") * dir;
          }
          case "shelf": {
            const aInv2 = locationFilter === "ALL" ? a.inventory[0] : a.inventory.find((i) => i.locationId === locationFilter) || a.inventory[0];
            const bInv2 = locationFilter === "ALL" ? b.inventory[0] : b.inventory.find((i) => i.locationId === locationFilter) || b.inventory[0];
            return (aInv2?.shelfLocation || "").localeCompare(bInv2?.shelfLocation || "", undefined, { numeric: true }) * dir;
          }
          case "area2": {
            const aI = locationFilter === "ALL" ? a.inventory[0] : a.inventory.find((i) => i.locationId === locationFilter) || a.inventory[0];
            const bI = locationFilter === "ALL" ? b.inventory[0] : b.inventory.find((i) => i.locationId === locationFilter) || b.inventory[0];
            return (aI?.storageArea2 || "").localeCompare(bI?.storageArea2 || "") * dir;
          }
          case "shelf2": {
            const aI = locationFilter === "ALL" ? a.inventory[0] : a.inventory.find((i) => i.locationId === locationFilter) || a.inventory[0];
            const bI = locationFilter === "ALL" ? b.inventory[0] : b.inventory.find((i) => i.locationId === locationFilter) || b.inventory[0];
            return (aI?.shelfLocation2 || "").localeCompare(bI?.shelfLocation2 || "", undefined, { numeric: true }) * dir;
          }
          case "cost":
            return ((a.bottleCostCents || 0) - (b.bottleCostCents || 0)) * dir;
          case "pour":
            return (getPourSize(a) - getPourSize(b)) * dir;
          case "pourCost":
            return (getPourCostCents(a) - getPourCostCents(b)) * dir;
          case "suggested":
            return (getSuggestedPriceCents(a) - getSuggestedPriceCents(b)) * dir;
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
    statusFilter,
    sortField,
    sortDir,
  ]);

  // ===== BULK SELECTION HELPERS (Products mode) =====
  // visibleIds = the products currently passing the filters/sort in Products mode.
  // Select-all only operates on this set, never the whole 374-product universe.
  const visibleIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected =
    !allVisibleSelected && visibleIds.some((id) => selectedIds.has(id));

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        // Unselect all currently-visible rows (keeps any selections outside the filter)
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function applyBulkAdd() {
    if (selectedIds.size === 0 || !bulkAddLocationId) return;
    const loc = locations.find((l) => l.id === bulkAddLocationId);
    if (!loc) return;
    const parsedPar =
      bulkAddPar.trim() === "" ? undefined : parseFloat(bulkAddPar);
    if (parsedPar !== undefined && (isNaN(parsedPar) || parsedPar < 0)) {
      setBulkBanner({ kind: "error", text: "Par level must be 0 or higher." });
      return;
    }
    setBulkBusy(true);
    try {
      const result = await bulkAddProductsToLocation({
        productIds: Array.from(selectedIds),
        locationId: bulkAddLocationId,
        parLevel: parsedPar,
      });
      if ("error" in result) {
        setBulkBanner({ kind: "error", text: result.error });
      } else {
        const total = selectedIds.size;
        const added = result.count;
        const skipped = total - added;
        const shortName = loc.name.replace("Meyhouse ", "");
        const msg =
          added === 0
            ? `All ${total} products were already at ${shortName}.`
            : skipped > 0
              ? `Added ${added} products to ${shortName} (${skipped} already there).`
              : `Added ${added} ${added === 1 ? "product" : "products"} to ${shortName}.`;
        setBulkBanner({ kind: "success", text: msg });
        clearSelection();
        setBulkAddPar("");
        router.refresh();
      }
    } catch (e) {
      setBulkBanner({
        kind: "error",
        text: e instanceof Error ? e.message : "Failed to add products.",
      });
    } finally {
      setBulkBusy(false);
    }
  }

  async function applyBulkRemove() {
    if (selectedIds.size === 0 || !bulkRemoveLocationId) return;
    const loc = locations.find((l) => l.id === bulkRemoveLocationId);
    if (!loc) return;
    const shortName = loc.name.replace("Meyhouse ", "");
    const ok = confirm(
      `Remove ${selectedIds.size} ${selectedIds.size === 1 ? "product" : "products"} from ${shortName}? This deletes their inventory rows and stock counts for that location.`
    );
    if (!ok) return;
    setBulkBusy(true);
    try {
      const result = await bulkRemoveProductsFromLocation({
        productIds: Array.from(selectedIds),
        locationId: bulkRemoveLocationId,
      });
      if ("error" in result) {
        setBulkBanner({ kind: "error", text: result.error });
      } else {
        const removed = result.count;
        const msg =
          removed === 0
            ? `None of the selected products were at ${shortName}.`
            : `Removed ${removed} ${removed === 1 ? "product" : "products"} from ${shortName}.`;
        setBulkBanner({ kind: "success", text: msg });
        clearSelection();
        router.refresh();
      }
    } catch (e) {
      setBulkBanner({
        kind: "error",
        text: e instanceof Error ? e.message : "Failed to remove products.",
      });
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field)
      return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 text-[var(--brand-olive)]" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[var(--brand-olive)]" />
    );
  }

  function formatCents(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  // Inline edit handlers
  function startEdit(productId: string, field: string, currentValue: string) {
    saveScroll();
    setEditingCell({ productId, field });
    setEditValue(currentValue);
    // Restore scroll on next frame (after autoFocus triggers browser scroll-into-view)
    requestAnimationFrame(() => {
      if (scrollContainerRef.current && savedScrollPos.current > 0) {
        scrollContainerRef.current.scrollTop = savedScrollPos.current;
      }
    });
  }

  async function saveEdit(productId: string, field: string) {
    const newValue = editValue; // capture BEFORE any state changes
    saveScroll();
    setEditingCell(null);
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const data: any = {
      name: product.name,
      type: product.type,
      vendorId: product.vendorId || undefined,
      ingredientCategory: product.ingredientCategory || undefined,
      bottleSizeMl: product.bottleSizeMl || undefined,
      bottleSizeUnit: product.bottleSizeUnit || "ml",
      yieldCount: product.yieldCount ?? null,
      yieldUnit: product.yieldUnit ?? null,
      casePackSize: product.casePackSize || undefined,
      bottleCostCents: product.bottleCostCents || undefined,
      locationIds: product.locationIds,
    };

    if (field === "bottleCost") {
      data.bottleCostCents = newValue
        ? Math.round(parseFloat(newValue) * 100)
        : undefined;
    } else if (field === "vendor") {
      data.vendorId = newValue || undefined;
    } else if (field === "category") {
      data.ingredientCategory = newValue || undefined;
    } else if (field === "name") {
      if (!newValue.trim()) { setMarkerError("Name cannot be empty"); return; }
      data.name = newValue;
    } else if (field === "bottleSize") {
      data.bottleSizeMl = newValue ? parseInt(newValue) : undefined;
    } else if (field === "casePack") {
      const n = newValue ? parseInt(newValue) : 0;
      // Allow negative special values (CASE_BOTTLE_ONLY=-1, CASE_SINGLE=-2, CASE_KEG=-3) and positive pack sizes
      data.casePackSize = (n !== 0 && !isNaN(n)) ? n : undefined;
    } else if (field === "yield") {
      const n = newValue ? parseInt(newValue) : null;
      data.yieldCount = (n && n > 0) ? n : null;
      data.yieldUnit = (n && n > 0) ? "each" : null;
    } else if (field === "location") {
      try { await updateProductStorageArea(productId, newValue, locationFilter !== "ALL" ? locationFilter : undefined, 1); }
      catch (e) { console.error("updateProductStorageArea failed:", e); setMarkerError("Failed to save area"); }
      return;
    } else if (field === "shelf") {
      try { await updateProductShelf(productId, newValue, locationFilter !== "ALL" ? locationFilter : undefined, 1); }
      catch (e) { console.error("updateProductShelf failed:", e); setMarkerError("Failed to save shelf"); }
      return;
    } else if (field === "location2") {
      try { await updateProductStorageArea(productId, newValue, locationFilter !== "ALL" ? locationFilter : undefined, 2); }
      catch (e) { console.error("updateProductStorageArea2 failed:", e); setMarkerError("Failed to save area 2"); }
      return;
    } else if (field === "shelf2") {
      try { await updateProductShelf(productId, newValue, locationFilter !== "ALL" ? locationFilter : undefined, 2); }
      catch (e) { console.error("updateProductShelf2 failed:", e); setMarkerError("Failed to save shelf 2"); }
      return;
    }

    try {
      await updateProduct(productId, data);
    } catch (e) {
      console.error("updateProduct failed for field:", field, "data:", data, "error:", e);
      const msg = (e as Error)?.message || "";
      // If it's our pre-check error with a clear message, show it
      if (msg.includes("already exists")) {
        setMarkerError(msg);
      } else if (msg.includes("Unique constraint") && msg.includes("name")) {
        setMarkerError(`A product named "${data.name}" already exists (may be inactive or in database). Rename or delete the existing product first.`);
      } else {
        setMarkerError(`Failed to save ${field}. Check console for details.`);
      }
    }
  }

  // Attach a vendor to a product outside the inline-edit flow (used by the
  // Add-Vendor drawer). Mirrors saveEdit's full-payload updateProduct call.
  async function assignVendorToProduct(productId: string, vendorId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const data: any = {
      name: product.name,
      type: product.type,
      vendorId: vendorId || undefined,
      ingredientCategory: product.ingredientCategory || undefined,
      bottleSizeMl: product.bottleSizeMl || undefined,
      bottleSizeUnit: product.bottleSizeUnit || "ml",
      yieldCount: product.yieldCount ?? null,
      yieldUnit: product.yieldUnit ?? null,
      casePackSize: product.casePackSize || undefined,
      bottleCostCents: product.bottleCostCents || undefined,
      locationIds: product.locationIds,
    };
    try {
      await updateProduct(productId, data);
    } catch (e) {
      console.error("assignVendorToProduct failed:", e);
      setMarkerError("Failed to assign vendor");
    }
  }

  function handleKeyDown(
    e: React.KeyboardEvent,
    productId: string,
    field: string
  ) {
    if (e.key === "Enter") {
      saveEdit(productId, field);
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  }

  // Switch mode and update URL
  function switchMode(newMode: Mode) {
    setMode(newMode);
    const params = new URLSearchParams(searchParams.toString());
    if (newMode === "products") {
      params.delete("mode");
    } else {
      params.set("mode", newMode);
    }
    const qs = params.toString();
    router.replace(`/dashboard/products${qs ? `?${qs}` : ""}`, {
      scroll: false,
    });
  }

  // Full Screen View toggle — defined once and reused so it can appear on
  // every mode tab (the location bar only renders for Order/Count). Olive
  // when on; always visible so it's the way back out in any mode.
  const fullScreenToggle = (
    <button
      type="button"
      onClick={() => setFullScreenViewPersisted(!fullScreenView)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
        fullScreenView
          ? "bg-[var(--brand-olive)] border-[var(--brand-olive)] text-white hover:bg-[var(--brand-olive-hover)]"
          : "bg-white border-[var(--line)] text-[var(--brand-brown)] hover:bg-[var(--brand-cream)]"
      }`}
      title={fullScreenView ? "Exit Full Screen View (Esc)" : "Enter Full Screen View"}
    >
      {fullScreenView ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      Full Screen View
    </button>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Sticky top section: header + tabs + filters */}
      <div className="flex-shrink-0 p-4 lg:px-8 lg:pt-8 lg:pb-0">
      {/* Header — hidden in Full Screen View */}
      {!fullScreenView && (
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Product Hub</h1>
          <p className="text-[var(--ink-muted)] text-sm">
            {filtered.length} of {products.length} products
            {locations.length > 0 && ` across ${locations.length} locations`}
          </p>
        </div>

        {/* Marker toolbar — only in products mode */}
        {mode === "products" && (() => {
          const selected = highlightedRow ? products.find((p) => p.id === highlightedRow) : null;
          const isStorePicked = locationFilter !== "ALL";
          // Get inventory for selected store on selected product
          const selectedInv = selected && isStorePicked
            ? selected.inventory.find((i) => i.locationId === locationFilter) || null
            : null;

          // Tag handler — requires a specific store (per-store tags like BTG, Craft, Well, Half, Dessert)
          const handleMarkerClick = async (fn: () => Promise<unknown>) => {
            setMarkerError("");
            if (!selected) {
              setMarkerError("Click a product row first.");
              return;
            }
            if (!isStorePicked) {
              setMarkerError("Select a specific store from the Location filter first. Tags are per-store.");
              return;
            }
            if (!selectedInv) {
              setMarkerError("This product is not assigned to the selected store.");
              return;
            }
            saveScroll();
            try {
              await fn();
            } catch (e) {
              setMarkerError("Failed to save. Try again.");
              console.error("Marker toggle error:", e);
            }
          };

          // Removal handler — Database/Delete can work on single store or ALL stores
          const handleRemovalClick = async (target: "DATABASE" | "INACTIVE") => {
            setMarkerError("");
            if (!selected) {
              setMarkerError("Click a product row first.");
              return;
            }
            saveScroll();
            try {
              if (isStorePicked) {
                // Toggle just for this store
                const currentlyMarked = selectedInv?.markedForRemoval === target;
                await toggleMarkForRemoval(selected.id, locationFilter, currentlyMarked ? null : target);
              } else {
                // All Locations — check if ALL stores already have this marker
                const allMarked = selected.inventory.length > 0 && selected.inventory.every((inv) => inv.markedForRemoval === target);
                const newTarget = allMarked ? null : target;
                // Apply to every store the product exists in
                for (const inv of selected.inventory) {
                  await toggleMarkForRemoval(selected.id, inv.locationId, newTarget);
                }
              }
            } catch (e) {
              setMarkerError("Failed to save. Try again.");
              console.error("Removal toggle error:", e);
            }
          };

          const disabled = !isStorePicked;
          // Database/Delete buttons are never "disabled by store selection" — they work on All Locations too
          const removalDisabled = !selected;
          const btnBase = "flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors border text-[10px] font-medium whitespace-nowrap";
          const disabledBtn = "bg-[var(--brand-cream)] border-[var(--line)] text-[var(--ink-muted)] cursor-not-allowed";

          // For Database/Delete in All Locations mode: show active if ALL stores have the marker
          const allMarkedDB = selected && selected.inventory.length > 0 && selected.inventory.every((inv) => inv.markedForRemoval === "DATABASE");
          const allMarkedDel = selected && selected.inventory.length > 0 && selected.inventory.every((inv) => inv.markedForRemoval === "INACTIVE");
          const dbActive = isStorePicked ? selectedInv?.markedForRemoval === "DATABASE" : !!allMarkedDB;
          const delActive = isStorePicked ? selectedInv?.markedForRemoval === "INACTIVE" : !!allMarkedDel;
          const removalBtnStyle = (color: string, active: boolean) => {
            if (removalDisabled) return disabledBtn;
            return active ? COLOR_STYLES[color].active : COLOR_STYLES[color].idle;
          };

          // Each icon has a persistent color (matches row highlight color). Active state = fuller background.
          const COLOR_STYLES: Record<string, { idle: string; active: string }> = {
            yellow:  { idle: "bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100",     active: "bg-yellow-600 border-yellow-700 text-white shadow-sm" },
            red:     { idle: "bg-red-50 border-red-200 text-red-700 hover:bg-red-100",                active: "bg-red-600 border-red-700 text-white shadow-sm" },
            purple:  { idle: "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100",    active: "bg-purple-600 border-purple-700 text-white shadow-sm" },
            teal:    { idle: "bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100",            active: "bg-teal-600 border-teal-700 text-white shadow-sm" },
            blue:    { idle: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100",            active: "bg-blue-600 border-blue-700 text-white shadow-sm" },
            orange:  { idle: "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100",    active: "bg-orange-600 border-orange-700 text-white shadow-sm" },
            emerald: { idle: "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100", active: "bg-emerald-600 border-emerald-700 text-white shadow-sm" },
          };
          const btnStyle = (color: string, active: boolean) => {
            if (disabled) return disabledBtn;
            return active ? COLOR_STYLES[color].active : COLOR_STYLES[color].idle;
          };

          const currentStoreName = isStorePicked
            ? (locations.find((l) => l.id === locationFilter)?.name?.replace("Meyhouse ", "") || "this store")
            : "";
          const disabledTitle = "Select a specific store first (per-store tags)";

          return (
            <div className="flex items-center gap-2">
              {/* Database — yellow (works in All Locations too) */}
              <button
                onClick={() => handleRemovalClick("DATABASE")}
                className={`${btnBase} ${removalBtnStyle("yellow", dbActive)}`}
                title={removalDisabled ? "Click a product row first" : (isStorePicked
                  ? (dbActive ? `Unmark for ${currentStoreName}` : `Mark "${selected?.name}" for Database at ${currentStoreName}`)
                  : (dbActive ? `Unmark from all stores` : `Mark "${selected?.name}" for Database at ALL stores`))}
              >
                <Archive className="w-4 h-4" />
                <span>Database</span>
              </button>
              {/* Delete — red (works in All Locations too) */}
              <button
                onClick={() => handleRemovalClick("INACTIVE")}
                className={`${btnBase} ${removalBtnStyle("red", delActive)}`}
                title={removalDisabled ? "Click a product row first" : (isStorePicked
                  ? (delActive ? `Unmark for ${currentStoreName}` : `Mark "${selected?.name}" to permanently delete at ${currentStoreName}`)
                  : (delActive ? `Unmark from all stores` : `Mark "${selected?.name}" for deletion at ALL stores`))}
              >
                <XCircle className="w-4 h-4" />
                <span>Delete</span>
              </button>
              {/* Craft Cocktail — teal */}
              <button
                onClick={() => handleMarkerClick(() => toggleProductTag(selected!.id, locationFilter, "craft", !selectedInv?.isCraftCocktailIngredient))}
                className={`${btnBase} ${btnStyle("teal", !!selectedInv?.isCraftCocktailIngredient)}`}
                title={disabled ? disabledTitle : (selected ? (selectedInv?.isCraftCocktailIngredient ? `Unmark Craft for ${currentStoreName}` : `Tag "${selected.name}" as Craft Cocktail at ${currentStoreName}`) : "Click a product row first")}
              >
                <FlaskConical className="w-4 h-4" />
                <span>Craft Cocktail</span>
              </button>
              {/* Well Spirit — blue */}
              <button
                onClick={() => handleMarkerClick(() => toggleProductTag(selected!.id, locationFilter, "well", !selectedInv?.isWellSpirit))}
                className={`${btnBase} ${btnStyle("blue", !!selectedInv?.isWellSpirit)}`}
                title={disabled ? disabledTitle : (selected ? (selectedInv?.isWellSpirit ? `Unmark Well for ${currentStoreName}` : `Tag "${selected.name}" as Well Spirit at ${currentStoreName}`) : "Click a product row first")}
              >
                <GlassWater className="w-4 h-4" />
                <span>Well Spirit</span>
              </button>
              {/* Half Bottle — orange */}
              <button
                onClick={() => handleMarkerClick(() => toggleProductTag(selected!.id, locationFilter, "half", !selectedInv?.isHalfBottle))}
                className={`${btnBase} ${btnStyle("orange", !!selectedInv?.isHalfBottle)}`}
                title={disabled ? disabledTitle : (selected ? (selectedInv?.isHalfBottle ? `Unmark Half Bottle for ${currentStoreName}` : `Tag "${selected.name}" as Half Bottle at ${currentStoreName}`) : "Click a product row first")}
              >
                <Milk className="w-4 h-4" />
                <span>Half Bottle</span>
              </button>
              {/* Dessert Wine — emerald */}
              <button
                onClick={() => handleMarkerClick(() => toggleProductTag(selected!.id, locationFilter, "dessert", !selectedInv?.isDessertWine))}
                className={`${btnBase} ${btnStyle("emerald", !!selectedInv?.isDessertWine)}`}
                title={disabled ? disabledTitle : (selected ? (selectedInv?.isDessertWine ? `Unmark Dessert Wine for ${currentStoreName}` : `Tag "${selected.name}" as Dessert Wine at ${currentStoreName}`) : "Click a product row first")}
              >
                <Grape className="w-4 h-4" />
                <span>Dessert Wine</span>
              </button>
            </div>
          );
        })()}

        <Link
          href="/dashboard/products/new"
          className="flex items-center gap-2 px-4 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </Link>
      </div>
      )}

      {markerError && mode === "products" && !fullScreenView && (
        <div className="bg-[#FAF7F1] border border-[var(--brand-olive)] text-[var(--brand-olive-hover)] px-3 py-2 rounded-lg text-xs mb-3">{markerError}</div>
      )}

      {/* Mode tabs — segmented control: icon on top, label (11px) below.
          Active cell is solid Sophra olive; inactive cells are transparent so
          the warm cream container reads as a single rounded "track" beneath. */}
      <div
        className={`grid grid-cols-4 gap-1 rounded-[10px] ${fullScreenView ? "p-0.5 mb-2" : "p-1 mb-4"}`}
        style={{ background: "#EDE5D0" }}
      >
        {[
          { key: "ordering" as Mode, label: "Order", icon: ShoppingCart },
          { key: "inventory" as Mode, label: "Count", icon: ClipboardList },
          { key: "products" as Mode, label: "Inventory", icon: Package },
          { key: "pricing" as Mode, label: "Pricing", icon: DollarSign },
        ].map((tab) => {
          const isActive = mode === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => switchMode(tab.key)}
              className={`flex items-center justify-center rounded-[8px] transition-colors duration-150 ${
                fullScreenView ? "flex-row gap-1.5 px-2 py-1" : "flex-col gap-1"
              } ${
                isActive
                  ? "bg-[var(--brand-olive)] text-white"
                  : "bg-transparent text-[var(--ink-muted)] hover:text-[var(--brand-brown)]"
              }`}
              style={{ minHeight: fullScreenView ? 28 : 56 }}
            >
              <tab.icon
                className={fullScreenView ? "w-4 h-4" : "w-[22px] h-[22px]"}
                strokeWidth={1.75}
              />
              <span
                className="text-[11px] leading-none"
                style={{ fontWeight: isActive ? 500 : 400 }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 ${fullScreenView ? "mb-2 [&_select]:py-1 [&_input]:py-1" : "mb-4"}`}>
        <div className="relative col-span-2 sm:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-muted)]" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearchPersisted(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilterPersisted(e.target.value)}
          className="px-3 py-2 bg-white border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
        >
          <option value="onMenu">On Menu</option>
          <option value="pending">Phasing Out (review)</option>
          <option value="database">Product Database</option>
          <option value="inactive">Inactive (cleanup)</option>
          <option value="all">All Products</option>
        </select>
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilterPersisted(e.target.value)}
          className="px-3 py-2 bg-white border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
        >
          <option value="ALL">All Vendors</option>
          {allVendors.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilterPersisted(e.target.value)}
          className="px-3 py-2 bg-white border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
        >
          <option value="ALL">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilterPersisted(e.target.value)}
          className="px-3 py-2 bg-white border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
        >
          <option value="ALL">All Locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      {/* Inventory & Pricing tabs have no location bar — give them a
          right-aligned Full Screen toggle so it's reachable (and closable)
          on every tab. */}
      {(mode === "products" || mode === "pricing") && (
        <div className="flex justify-end mt-1">
          {fullScreenToggle}
        </div>
      )}

      {/* Store selector + Area buttons — pinned for Ordering & Inventory modes */}
      {(mode === "ordering" || mode === "inventory") && (
        <div className={`bg-white border border-[var(--line)] rounded-xl mt-1 ${fullScreenView ? "p-2" : "p-3"}`}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-[var(--brand-olive)]" />
              <select
                value={selectedStoreId}
                onChange={(e) => {
                  setSelectedStoreId(e.target.value);
                  setSelectedArea("ALL");
                  if (mode === "inventory") {
                    setInventoryCounts({});
                    setSavedItems(new Set());
                  }
                }}
                className="px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] text-sm"
              >
                <option value="">— Select a store —</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              {/* In Full Screen View the area filter moves up here (inline) so the
                  bar stays a single narrow row instead of wrapping to a 2nd row. */}
              {fullScreenView && selectedStoreId && areaNames.length > 0 && (
                <select
                  value={selectedArea}
                  onChange={(e) => setSelectedArea(e.target.value)}
                  className="px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] text-sm"
                  aria-label="Filter by storage area"
                >
                  <option value="ALL">All Areas</option>
                  {areaNames.map((area) => (
                    <option key={area} value={area}>{area}</option>
                  ))}
                </select>
              )}
              {mode === "inventory" && selectedStoreId && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-[var(--ink-muted)]">{inventoryForStore.length} items</span>
                  <span className="text-[var(--brand-olive)] font-medium">{countedCount} counted</span>
                  <span className="text-green-600 font-medium">{savedItems.size} saved</span>
                </div>
              )}
              {mode === "inventory" && selectedStoreId && (
                <div className="text-xs text-[var(--ink-muted)]">
                  {new Date().toLocaleDateString()}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {mode === "ordering" && (
                <>
                  {/* Ordering mode: Single vs Multiple locations. Persists to the
                      org setting; the cart re-computes as merged/per-store. */}
                  <div
                    className="inline-flex rounded-lg border border-[var(--line)] overflow-hidden text-sm font-medium"
                    role="group"
                    aria-label="Ordering mode"
                  >
                    <button
                      type="button"
                      onClick={() => changeOrderMode(false)}
                      disabled={orderModePending}
                      aria-pressed={!mergedOptimistic}
                      title="Each location orders on its own"
                      className={`px-3 py-2 transition-colors disabled:opacity-60 ${
                        !mergedOptimistic
                          ? "bg-[var(--brand-olive)] text-white"
                          : "bg-[var(--brand-cream)] text-[var(--brand-brown)] hover:bg-[var(--line)]"
                      }`}
                    >
                      Single Location
                    </button>
                    <button
                      type="button"
                      onClick={() => changeOrderMode(true)}
                      disabled={orderModePending}
                      aria-pressed={mergedOptimistic}
                      title="One merged cart across all locations"
                      className={`px-3 py-2 transition-colors disabled:opacity-60 ${
                        mergedOptimistic
                          ? "bg-[var(--brand-olive)] text-white"
                          : "bg-[var(--brand-cream)] text-[var(--brand-brown)] hover:bg-[var(--line)]"
                      }`}
                    >
                      Multiple Locations
                    </button>
                  </div>
                  {canApprove && (
                    <button
                      onClick={handleEmailPreview}
                      disabled={emailLoading}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      title="Email APPROVED orders to vendors"
                    >
                      <Mail className="w-4 h-4" />
                      {emailLoading ? "Loading..." : "Email Approved Orders"}
                    </button>
                  )}
                  {selectedStoreId && (
                    <button
                      onClick={() => setShowCart(!showCart)}
                      className="flex items-center gap-2 px-3 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium transition-colors relative"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      {useMergedOrderCart ? "Merged Order Cart" : "Order Cart"}
                      {cartItems.length > 0 && (
                        <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">
                          {cartItems.length}
                        </span>
                      )}
                    </button>
                  )}
                </>
              )}
              {/* Full Screen View toggle — stays visible in both states so it's
                  always the way back out. Olive when on. */}
              {fullScreenToggle}
            </div>
          </div>
          {/* Area filter — chip row in regular view only. In Full Screen View the
              filter is moved up into the top row (above) as a compact dropdown. */}
          {!fullScreenView && selectedStoreId && areaNames.length > 0 && (
              <div className="flex gap-1.5 mt-3 flex-wrap">
                <button
                  onClick={() => setSelectedArea("ALL")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedArea === "ALL"
                      ? "bg-[var(--brand-olive)] text-white"
                      : "bg-[var(--brand-cream)] text-[var(--ink-muted)] hover:bg-[var(--line)]"
                  }`}
                >
                  All Areas
                </button>
                {areaNames.map((area) => (
                  <button
                    key={area}
                    onClick={() => setSelectedArea(area)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      selectedArea === area
                        ? "bg-[var(--brand-olive)] text-white"
                        : "bg-[var(--brand-cream)] text-[var(--ink-muted)] hover:bg-[var(--line)]"
                    }`}
                  >
                    {area}
                  </button>
                ))}
              </div>
          )}
        </div>
      )}

      </div>{/* end sticky top section */}

      {/* Scrollable table area — fills remaining height */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-auto px-4 lg:px-8 pb-4">

      {/* === MODE 1: PRODUCTS TABLE === */}
      {mode === "products" && (
        <div className="bg-white border border-[var(--line)] rounded-xl">
          <div>
            <table className="w-full min-w-[1500px] text-xs table-fixed">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[var(--brand-cream)] border-b border-[var(--line)] text-[10px] text-[var(--ink-muted)] uppercase font-medium">
                  {/* Bulk-select column — header checkbox toggles all currently-visible rows */}
                  <th className="px-2 py-2 w-[2.5%]">
                    <input
                      type="checkbox"
                      aria-label={allVisibleSelected ? "Unselect all visible products" : "Select all visible products"}
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someVisibleSelected;
                      }}
                      onChange={toggleSelectAllVisible}
                      disabled={visibleIds.length === 0}
                      className="align-middle accent-[var(--brand-olive)] cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-2 py-2 w-[15%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleSort("name")}>
                    <span className="flex items-center gap-1 whitespace-nowrap">Product <SortIcon field="name" /></span>
                  </th>
                  <th className="text-left px-2 py-2 w-[5%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleSort("size")}>
                    <span className="flex items-center gap-1 whitespace-nowrap">Size <SortIcon field="size" /></span>
                  </th>
                  <th className="text-center px-2 py-2 w-[4%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleSort("case")}>
                    <span className="flex items-center justify-center gap-1 whitespace-nowrap">Case <SortIcon field="case" /></span>
                  </th>
                  <th className="text-right px-2 py-2 w-[6%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleSort("cost")}>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap">Bottle $ <SortIcon field="cost" /></span>
                  </th>
                  <th className="text-left px-2 py-2 w-[8%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleSort("category")}>
                    <span className="flex items-center gap-1 whitespace-nowrap">Category <SortIcon field="category" /></span>
                  </th>
                  <th className="text-left px-2 py-2 w-[7%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleSort("vendor")}>
                    <span className="flex items-center gap-1 whitespace-nowrap">Vendor <SortIcon field="vendor" /></span>
                  </th>
                  <th className="text-left px-2 py-2 w-[6%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleSort("area")}>
                    <span className="flex items-center gap-1 whitespace-nowrap">Area 1 <SortIcon field="area" /></span>
                  </th>
                  <th className="text-left px-2 py-2 w-[5%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleSort("shelf")}>
                    <span className="flex items-center gap-1 whitespace-nowrap">Shelf 1 <SortIcon field="shelf" /></span>
                  </th>
                  <th className="text-left px-2 py-2 w-[6%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleSort("area2")}>
                    <span className="flex items-center gap-1 whitespace-nowrap">Area 2 <SortIcon field="area2" /></span>
                  </th>
                  <th className="text-left px-2 py-2 w-[5%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleSort("shelf2")}>
                    <span className="flex items-center gap-1 whitespace-nowrap">Shelf 2 <SortIcon field="shelf2" /></span>
                  </th>
                  <th className="text-center px-2 py-2 w-[6%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleSort("pour")}>
                    <span className="flex items-center justify-center gap-1 whitespace-nowrap">Pour <SortIcon field="pour" /></span>
                  </th>
                  <th className="text-right px-2 py-2 w-[6%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleSort("pourCost")}>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap">Pour $ <SortIcon field="pourCost" /></span>
                  </th>
                  <th className="text-right px-2 py-2 w-[7%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleSort("suggested")}>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap">Suggested <SortIcon field="suggested" /></span>
                  </th>
                  <th className="text-center px-2 py-2 w-[5%]"><span className="whitespace-nowrap">Stores</span></th>
                  <th className="text-right px-2 py-2 w-[5%]"><span className="whitespace-nowrap">Actions</span></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[var(--line)]">
                {filtered.length === 0 ? (
                  <tr><td colSpan={15} className="p-8 text-center text-[var(--ink-muted)]">No products match your filters</td></tr>
                ) : (
                  filtered.map((p) => {
                    const catData = getCategoryData(p);
                    const isBTB = catData?.servingStyle === "BTB";
                    const pourOz = getPourSize(p);
                    const pourCost = getPourCostCents(p);
                    const suggested = getSuggestedPriceCents(p);
                    const isEd = (field: string) => editingCell?.productId === p.id && editingCell?.field === field;
                    // Get inventory for selected location, or first if "All"
                    const isAllLocations = locationFilter === "ALL";
                    const activeInv = isAllLocations
                      ? p.inventory[0]
                      : p.inventory.find((inv) => inv.locationId === locationFilter) || p.inventory[0];
                    const storageArea = activeInv?.storageArea || null;
                    const storeCount = p.inventory.length;

                    return (
                      <tr key={p.id}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("input, select, button, a, [data-floating-edit]")) return;
                          // Clicking a row only toggles highlight — the floating editor
                          // now opens from the explicit ⚡ button at the left of the row.
                          const willHighlight = highlightedRow !== p.id;
                          setHighlightedRow(willHighlight ? p.id : null);
                          if (!willHighlight) closeFloatingEdit();
                        }}
                        className={`hover:bg-[var(--brand-cream)] cursor-pointer transition-colors ${(() => {
                          if (highlightedRow === p.id) return "!bg-[#FAF7F1] ring-1 ring-[var(--brand-olive)]";
                          // Determine which inventory to use for markers
                          const relevantInvs = isAllLocations ? p.inventory : (activeInv ? [activeInv] : []);
                          const anyInactive = relevantInvs.some((i) => i.markedForRemoval === "INACTIVE");
                          const anyDB = relevantInvs.some((i) => i.markedForRemoval === "DATABASE");
                          const anyPending = relevantInvs.some((i) => i.markedForRemoval === "PENDING");
                          const pendingOut = relevantInvs.some((i) => i.markedForRemoval === "PENDING" && i.currentStock <= 0);
                          const anyCraft = relevantInvs.some((i) => i.isCraftCocktailIngredient);
                          const anyWell = relevantInvs.some((i) => i.isWellSpirit);
                          const anyHalf = relevantInvs.some((i) => i.isHalfBottle);
                          const anyDessert = relevantInvs.some((i) => i.isDessertWine);
                          if (anyInactive) return "bg-red-50/60";
                          if (anyDB) return "bg-yellow-50/80";
                          if (pendingOut) return "bg-rose-100";
                          if (anyPending) return "bg-amber-50/70";
                          if (anyCraft) return "bg-teal-50/70";
                          if (anyWell) return "bg-blue-50/70";
                          if (anyHalf) return "bg-orange-50/70";
                          if (anyDessert) return "bg-emerald-50/70";
                          return "";
                        })()}`}>
                        {/* Bulk-select checkbox cell — stopPropagation so clicking the
                            checkbox doesn't also trigger the row's highlight toggle. */}
                        <td
                          className="px-2 py-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Select ${p.name}`}
                            checked={selectedIds.has(p.id)}
                            onChange={() => toggleSelectOne(p.id)}
                            className="align-middle accent-[var(--brand-olive)] cursor-pointer"
                          />
                        </td>
                        {/* Product Name — click to edit */}
                        <td className="px-2 py-2">
                          {isEd("name") ? (
                            <input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(p.id, "name")}
                              onKeyDown={(e) => handleKeyDown(e, p.id, "name")}
                              className="w-full px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-xs focus:outline-none"
                              autoFocus
                            />
                          ) : (() => {
                            const relevantInvs = isAllLocations ? p.inventory : (activeInv ? [activeInv] : []);
                            const anyInactive = relevantInvs.some((i) => i.markedForRemoval === "INACTIVE");
                            const anyDB = relevantInvs.some((i) => i.markedForRemoval === "DATABASE");
                            const anyPending = relevantInvs.some((i) => i.markedForRemoval === "PENDING");
                            const pendingOut = relevantInvs.some((i) => i.markedForRemoval === "PENDING" && i.currentStock <= 0);
                            const anyCraft = relevantInvs.some((i) => i.isCraftCocktailIngredient);
                            const anyWell = relevantInvs.some((i) => i.isWellSpirit);
                            const anyHalf = relevantInvs.some((i) => i.isHalfBottle);
                            const anyDessert = relevantInvs.some((i) => i.isDessertWine);
                            // For All Locations, show which stores have which markers in tooltip
                            const storeBadgeSuffix = (pred: (i: Product["inventory"][number]) => boolean) => {
                              if (!isAllLocations) return "";
                              const stores = p.inventory.filter(pred).map((i) => i.locationName.replace("Meyhouse ", ""));
                              return stores.length > 0 ? ` (${stores.join(", ")})` : "";
                            };
                            return (
                              <span className="flex items-center gap-1.5 min-w-0 w-full">
                                {/* ⚡ Quick Edit button — visible per row, at the left so no horizontal scrolling is needed */}
                                <button
                                  data-floating-edit
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const rowEl = (e.currentTarget as HTMLElement).closest("tr");
                                    if (!rowEl) return;
                                    // Toggle highlight + open/close popup
                                    if (floatingEditProductId === p.id) {
                                      closeFloatingEdit();
                                      setHighlightedRow(null);
                                    } else {
                                      setHighlightedRow(p.id);
                                      openFloatingEdit(p.id, rowEl as HTMLElement);
                                    }
                                  }}
                                  className={`flex-shrink-0 p-1 rounded transition-colors ${
                                    floatingEditProductId === p.id
                                      ? "bg-[var(--brand-olive)] text-white"
                                      : "text-[var(--ink-muted)] hover:text-[var(--brand-olive)] hover:bg-[#FAF7F1]"
                                  }`}
                                  title="Quick edit par levels & store assignments"
                                >
                                  <Zap className="w-3.5 h-3.5" />
                                </button>
                                <span
                                  className="font-medium text-xs cursor-pointer hover:text-[var(--brand-olive)] truncate min-w-0"
                                  onClick={() => startEdit(p.id, "name", p.name)}
                                  title={p.name}
                                >
                                {p.isKeyItem && <Star className="w-3 h-3 text-[var(--brand-olive)] fill-[var(--brand-olive)] inline mr-1" />}
                                {p.name}
                                </span>
                                {/* Tags — kept on a non-shrinking row so they stay visible even when the name truncates */}
                                <span className="flex items-center gap-1 flex-shrink-0">
                                {p.menuStatus === "DATABASE" && <span className="text-[9px] bg-[rgba(74,93,39,0.12)] text-[var(--brand-olive-hover)] px-1 py-0.5 rounded">database</span>}
                                {p.menuStatus === "INACTIVE" && <span className="text-[9px] bg-red-100 text-red-600 px-1 py-0.5 rounded">inactive</span>}
                                {anyDB && <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 py-0.5 rounded" title={`Marked for Database${storeBadgeSuffix((i) => i.markedForRemoval === "DATABASE")}`}>→ DB</span>}
                                {anyInactive && <span className="text-[9px] bg-red-100 text-red-600 px-1 py-0.5 rounded" title={`Marked to Delete${storeBadgeSuffix((i) => i.markedForRemoval === "INACTIVE")}`}>→ ✕</span>}
                                {pendingOut && <span className="text-[9px] bg-rose-200 text-rose-800 px-1 py-0.5 rounded font-semibold" title={`Out of stock — decide to remove or move to database${storeBadgeSuffix((i) => i.markedForRemoval === "PENDING" && i.currentStock <= 0)}`}>OUT ⚠</span>}
                                {anyPending && !pendingOut && <span className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded" title={`Phasing out — remove when stock runs out${storeBadgeSuffix((i) => i.markedForRemoval === "PENDING")}`}>⏳ phasing out</span>}
                                {anyCraft && <span className="text-[9px] bg-teal-100 text-teal-700 px-1 py-0.5 rounded" title={`Craft Cocktail${storeBadgeSuffix((i) => i.isCraftCocktailIngredient)}`}>CC</span>}
                                {anyWell && <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded" title={`Well Spirit${storeBadgeSuffix((i) => i.isWellSpirit)}`}>Well</span>}
                                {anyHalf && <span className="text-[9px] bg-orange-100 text-orange-700 px-1 py-0.5 rounded" title={`Half Bottle${storeBadgeSuffix((i) => i.isHalfBottle)}`}>½</span>}
                                {anyDessert && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded" title={`Dessert Wine${storeBadgeSuffix((i) => i.isDessertWine)}`}>🍇</span>}
                                </span>
                              </span>
                            );
                          })()}
                        </td>

                        {/* Size — click to edit (dropdown + custom entry) */}
                        <td className="px-2 py-2">
                          {isEd("bottleSize") ? (
                            customSizeMode && customSizeProductId === p.id ? (
                              <div className="flex items-center gap-1" onBlur={(e) => {
                                if (!e.currentTarget.contains(e.relatedTarget as Node)) saveCustomSize();
                              }}>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={customSizeValue}
                                  onChange={(e) => setCustomSizeValue(e.target.value)}
                                  placeholder="Size"
                                  className="w-14 px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-[10px] focus:outline-none"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveCustomSize();
                                    if (e.key === "Escape") { setCustomSizeMode(false); setEditingCell(null); }
                                  }}
                                />
                                <select value={customSizeUnit} onChange={(e) => setCustomSizeUnit(e.target.value)}
                                  className="px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-[10px] focus:outline-none">
                                  <option value="ml">ml</option>
                                  <option value="oz">fl oz</option>
                                  <option value="gal">gallon</option>
                                  <option value="solid_oz">solid oz</option>
                                  <option value="lb">lb</option>
                                  <option value="g">gram</option>
                                  <option value="kg">kg</option>
                                </select>
                                <button onClick={saveCustomSize}
                                  className="px-1.5 py-0.5 bg-[var(--brand-olive)] text-white rounded text-[10px] font-medium hover:bg-[var(--brand-olive)]">
                                  ✓
                                </button>
                              </div>
                            ) : (
                            <select
                              value={editValue}
                              onChange={(e) => {
                                if (e.target.value === "__custom__") {
                                  setCustomSizeMode(true);
                                  setCustomSizeProductId(p.id);
                                  setCustomSizeValue("");
                                  setCustomSizeUnit("ml");
                                  return;
                                }
                                const newVal = e.target.value;
                                const newSize = newVal ? Number(newVal) : undefined;
                                saveScroll();
                                setEditValue(newVal);
                                setEditingCell(null);
                                const product = products.find((pr) => pr.id === p.id);
                                if (product) {
                                  updateProduct(p.id, {
                                    name: product.name, type: product.type,
                                    vendorId: product.vendorId || undefined,
                                    ingredientCategory: product.ingredientCategory || undefined,
                                    bottleSizeMl: newSize,
                                    bottleSizeUnit: "ml",
                                    yieldCount: product.yieldCount ?? null,
                                    yieldUnit: product.yieldUnit ?? null,
                                    casePackSize: product.casePackSize || undefined,
                                    bottleCostCents: product.bottleCostCents || undefined,
                                    locationIds: product.locationIds,
                                  });
                                }
                              }}
                              onBlur={() => setEditingCell(null)}
                              className="w-full px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-[10px] focus:outline-none"
                              autoFocus
                            >
                              <option value="">—</option>
                              {(() => {
                                const sorted = sortBottleSizes(bottleSizes);
                                const groups: Record<SizeGroup, number[]> = { ml: [], oz: [], weight: [], keg: [] };
                                sorted.forEach((s) => groups[classifySize(s)].push(s));
                                const labels: Record<SizeGroup, string> = { ml: "Milliliters", oz: "Ounces", weight: "Weight", keg: "Kegs / Large" };
                                return (["ml", "oz", "weight", "keg"] as SizeGroup[]).map((g) =>
                                  groups[g].length > 0 ? (
                                    <optgroup key={g} label={labels[g]}>
                                      {groups[g].map((s) => (
                                        <option key={s} value={s}>{formatSizeMl(s)}</option>
                                      ))}
                                    </optgroup>
                                  ) : null
                                );
                              })()}
                              <option value="__custom__">Custom size...</option>
                            </select>
                            )
                          ) : (
                            <span
                              className="text-[10px] text-[var(--ink-muted)] cursor-pointer hover:text-[var(--brand-olive)]"
                              onClick={() => startEdit(p.id, "bottleSize", p.bottleSizeMl?.toString() || "")}
                            >
                              {p.bottleSizeMl ? formatSize(p.bottleSizeMl, p.bottleSizeUnit) : "—"}
                            </span>
                          )}
                        </td>

                        {/* Case pack size — dropdown */}
                        <td className="px-2 py-2 text-center">
                          {customCaseMode && customCaseProductId === p.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="1"
                                min="1"
                                value={customCaseValue}
                                onChange={(e) => setCustomCaseValue(e.target.value)}
                                placeholder="Qty"
                                autoFocus
                                className="w-14 px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-[10px] text-center focus:outline-none"
                                onKeyDown={async (e) => {
                                  if (e.key === "Enter") {
                                    const n = parseInt(customCaseValue);
                                    if (n > 0) {
                                      saveScroll();
                                      setEditValue(n.toString());
                                      await saveEdit(p.id, "casePack");
                                    }
                                    setCustomCaseMode(false);
                                    setCustomCaseValue("");
                                  }
                                  if (e.key === "Escape") { setCustomCaseMode(false); setCustomCaseValue(""); }
                                }}
                                onBlur={async () => {
                                  const n = parseInt(customCaseValue);
                                  if (n > 0) {
                                    saveScroll();
                                    setEditValue(n.toString());
                                    await saveEdit(p.id, "casePack");
                                  }
                                  setCustomCaseMode(false);
                                  setCustomCaseValue("");
                                }}
                              />
                            </div>
                          ) : isEd("casePack") ? (
                            <select
                              value={editValue}
                              autoFocus
                              onChange={async (e) => {
                                const val = e.target.value;
                                // Capture scroll position BEFORE any state update
                                const currentScroll = scrollContainerRef.current?.scrollTop || 0;
                                savedScrollPos.current = currentScroll;
                                shouldRestoreScroll.current = true;

                                if (val === "__custom__") {
                                  setCustomCaseMode(true);
                                  setCustomCaseProductId(p.id);
                                  setCustomCaseValue("");
                                  setEditingCell(null);
                                  return;
                                }
                                setEditValue(val);
                                setEditingCell(null);
                                const product = products.find((pr) => pr.id === p.id);
                                if (product) {
                                  await updateProduct(p.id, {
                                    name: product.name, type: product.type,
                                    vendorId: product.vendorId || undefined,
                                    ingredientCategory: product.ingredientCategory || undefined,
                                    bottleSizeMl: product.bottleSizeMl || undefined,
                                    bottleSizeUnit: product.bottleSizeUnit || "ml",
                                    yieldCount: product.yieldCount ?? null,
                                    yieldUnit: product.yieldUnit ?? null,
                                    casePackSize: val ? parseInt(val) : undefined,
                                    bottleCostCents: product.bottleCostCents || undefined,
                                    locationIds: product.locationIds,
                                  });
                                  // Extra scroll restores after server refresh
                                  [0, 50, 150, 300].forEach((delay) => {
                                    setTimeout(() => {
                                      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = currentScroll;
                                    }, delay);
                                  });
                                }
                              }}
                              onBlur={() => setEditingCell(null)}
                              className="w-full px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-[10px] focus:outline-none"
                            >
                              <option value="">—</option>
                              <option value={CASE_BOTTLE_ONLY}>Bottle Only</option>
                              <option value={CASE_SINGLE}>Single</option>
                              <option value={CASE_KEG}>Keg</option>
                              <option value="2">2-Pack</option>
                              <option value="3">3-Pack</option>
                              <option value="4">4-Pack</option>
                              <option value="6">6-Pack</option>
                              <option value="12">12-Pack</option>
                              <option value="15">15-Pack</option>
                              <option value="20">20-Pack</option>
                              <option value="24">24-Pack</option>
                              <option value="48">48-Pack</option>
                              <option value="__custom__">Custom...</option>
                            </select>
                          ) : (
                            <span
                              className="text-[10px] text-[var(--ink-muted)] cursor-pointer hover:text-[var(--brand-olive)] whitespace-nowrap"
                              onClick={() => startEdit(p.id, "casePack", p.casePackSize?.toString() || "")}
                            >
                              {formatCaseSize(p.casePackSize)}
                            </span>
                          )}
                        </td>

                        {/* Bottle Cost — click to edit */}
                        <td className="px-2 py-2 text-right">
                          {isEd("bottleCost") ? (
                            <input
                              type="number"
                              step="0.01"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(p.id, "bottleCost")}
                              onKeyDown={(e) => handleKeyDown(e, p.id, "bottleCost")}
                              className="w-full px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-xs text-right focus:outline-none"
                              autoFocus
                            />
                          ) : (
                            <span
                              className={`text-xs cursor-pointer hover:text-[var(--brand-olive)] ${p.bottleCostCents ? "text-[var(--brand-brown)]" : "text-[var(--ink-muted)]"}`}
                              onClick={() => startEdit(p.id, "bottleCost", p.bottleCostCents ? (p.bottleCostCents / 100).toFixed(2) : "")}
                            >
                              {p.bottleCostCents ? formatCents(p.bottleCostCents) : "—"}
                            </span>
                          )}
                        </td>

                        {/* Category — click to edit */}
                        <td className="px-2 py-2">
                          {isEd("category") ? (
                            <select
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(p.id, "category")}
                              className="w-full px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-[10px] focus:outline-none"
                              autoFocus
                            >
                              <option value="">—</option>
                              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          ) : (
                            <span
                              className="text-[10px] text-[var(--brand-brown)] cursor-pointer hover:text-[var(--brand-olive)] block truncate"
                              onClick={() => startEdit(p.id, "category", p.ingredientCategory || "")}
                            >
                              {p.ingredientCategory || "—"}
                            </span>
                          )}
                        </td>

                        {/* Vendor — click to edit */}
                        <td className="px-2 py-2">
                          {isEd("vendor") ? (
                            <select
                              value={editValue}
                              onChange={(e) => {
                                if (e.target.value === "__add__") {
                                  setEditingCell(null);
                                  setAddVendorFor(p.id);
                                  return;
                                }
                                setEditValue(e.target.value);
                              }}
                              onBlur={() => saveEdit(p.id, "vendor")}
                              className="w-full px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-[10px] focus:outline-none"
                              autoFocus
                            >
                              <option value="__add__">+ Add new vendor…</option>
                              <option value="">—</option>
                              {vendorList.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                          ) : (
                            <span
                              className="text-[10px] text-[var(--brand-brown)] cursor-pointer hover:text-[var(--brand-olive)] block truncate"
                              onClick={() => startEdit(p.id, "vendor", p.vendorId || "")}
                            >
                              {p.vendor || "—"}
                            </span>
                          )}
                        </td>

                        {/* Location / Storage Area */}
                        <td className="px-2 py-2">
                          {isAllLocations ? (
                            <span className="text-[10px] text-[var(--ink-muted)]" title={p.inventory.map((inv) => `${inv.locationName}: ${inv.storageArea || "—"}`).join("\n")}>
                              {storeCount > 0 ? `${storeCount} ${storeCount === 1 ? "store" : "stores"}` : "—"}
                            </span>
                          ) : isEd("location") ? (
                            <select
                              value={editValue}
                              onChange={async (e) => {
                                const val = e.target.value;
                                if (val === "__custom__") {
                                  const name = prompt(`New storage area for ${locations.find((l) => l.id === locationFilter)?.name || "this store"}:`);
                                  if (name?.trim()) {
                                    const res = await createStorageArea(locationFilter, name.trim());
                                    if (!res.error) {
                                      saveScroll();
                                      setEditingCell(null);
                                      await updateProductStorageArea(p.id, name.trim(), locationFilter, 1);
                                    }
                                  } else {
                                    setEditingCell(null);
                                  }
                                  return;
                                }
                                saveScroll();
                                setEditValue(val);
                                setEditingCell(null);
                                await updateProductStorageArea(p.id, val, locationFilter, 1);
                              }}
                              onBlur={() => setEditingCell(null)}
                              className="w-full px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-[10px] focus:outline-none"
                              autoFocus
                            >
                              <option value="">—</option>
                              {(locations.find((l) => l.id === locationFilter)?.storageAreas || []).map((sa) => (
                                <option key={sa.id} value={sa.name}>{sa.name}</option>
                              ))}
                              <option value="__custom__">+ Custom area...</option>
                            </select>
                          ) : (
                            <span
                              className="text-[10px] text-[var(--ink-muted)] cursor-pointer hover:text-[var(--brand-olive)] block truncate"
                              onClick={() => startEdit(p.id, "location", storageArea || "")}
                            >
                              {storageArea || "—"}
                            </span>
                          )}
                        </td>

                        {/* Shelf 1 */}
                        <td className="px-2 py-2">
                          {isAllLocations ? (
                            <span className="text-[10px] text-[var(--ink-muted)]" title={p.inventory.map((inv) => `${inv.locationName}: ${inv.shelfLocation || "—"}`).join("\n")}>
                              {storeCount > 0 ? `${storeCount} ${storeCount === 1 ? "store" : "stores"}` : "—"}
                            </span>
                          ) : isEd("shelf") ? (
                            <input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(p.id, "shelf")}
                              onKeyDown={(e) => handleKeyDown(e, p.id, "shelf")}
                              placeholder="e.g. 5/3"
                              className="w-full px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-[10px] focus:outline-none"
                              autoFocus
                            />
                          ) : (
                            <span
                              className="text-[10px] text-[var(--ink-muted)] cursor-pointer hover:text-[var(--brand-olive)] block"
                              onClick={() => startEdit(p.id, "shelf", activeInv?.shelfLocation || "")}
                            >
                              {activeInv?.shelfLocation || "—"}
                            </span>
                          )}
                        </td>

                        {/* Area 2 */}
                        <td className="px-2 py-2">
                          {isAllLocations ? (
                            <span className="text-[10px] text-[var(--ink-muted)]" title={p.inventory.map((inv) => `${inv.locationName}: ${inv.storageArea2 || "—"}`).join("\n")}>
                              {storeCount > 0 ? `${storeCount} ${storeCount === 1 ? "store" : "stores"}` : "—"}
                            </span>
                          ) : isEd("location2") ? (
                            <select
                              value={editValue}
                              onChange={async (e) => {
                                const val = e.target.value;
                                if (val === "__custom__") {
                                  const name = prompt(`New storage area for ${locations.find((l) => l.id === locationFilter)?.name || "this store"}:`);
                                  if (name?.trim()) {
                                    const res = await createStorageArea(locationFilter, name.trim());
                                    if (!res.error) {
                                      saveScroll();
                                      setEditingCell(null);
                                      await updateProductStorageArea(p.id, name.trim(), locationFilter, 2);
                                    }
                                  } else {
                                    setEditingCell(null);
                                  }
                                  return;
                                }
                                saveScroll();
                                setEditValue(val);
                                setEditingCell(null);
                                await updateProductStorageArea(p.id, val, locationFilter, 2);
                              }}
                              onBlur={() => setEditingCell(null)}
                              className="w-full px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-[10px] focus:outline-none"
                              autoFocus
                            >
                              <option value="">—</option>
                              {(locations.find((l) => l.id === locationFilter)?.storageAreas || []).map((sa) => (
                                <option key={sa.id} value={sa.name}>{sa.name}</option>
                              ))}
                              <option value="__custom__">+ Custom area...</option>
                            </select>
                          ) : (
                            <span
                              className="text-[10px] text-[var(--ink-muted)] cursor-pointer hover:text-[var(--brand-olive)] block truncate"
                              onClick={() => startEdit(p.id, "location2", activeInv?.storageArea2 || "")}
                            >
                              {activeInv?.storageArea2 || "—"}
                            </span>
                          )}
                        </td>

                        {/* Shelf 2 */}
                        <td className="px-2 py-2">
                          {isAllLocations ? (
                            <span className="text-[10px] text-[var(--ink-muted)]" title={p.inventory.map((inv) => `${inv.locationName}: ${inv.shelfLocation2 || "—"}`).join("\n")}>
                              {storeCount > 0 ? `${storeCount} ${storeCount === 1 ? "store" : "stores"}` : "—"}
                            </span>
                          ) : isEd("shelf2") ? (
                            <input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(p.id, "shelf2")}
                              onKeyDown={(e) => handleKeyDown(e, p.id, "shelf2")}
                              placeholder="e.g. 3/1"
                              className="w-full px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-[10px] focus:outline-none"
                              autoFocus
                            />
                          ) : (
                            <span
                              className="text-[10px] text-[var(--ink-muted)] cursor-pointer hover:text-[var(--brand-olive)] block"
                              onClick={() => startEdit(p.id, "shelf2", activeInv?.shelfLocation2 || "")}
                            >
                              {activeInv?.shelfLocation2 || "—"}
                            </span>
                          )}
                        </td>

                        {/* Pour Size — clickable dropdown for multi-pour */}
                        <td className="px-2 py-2 text-center text-xs text-[var(--ink-muted)] relative">
                          {(() => {
                            if (isBTB) return <span className="text-blue-600 font-medium">BTB</span>;
                            if (catData?.servingStyle === "NONE") {
                              // Yield editable for grocery/food items
                              if (isEd("yield")) {
                                return (
                                  <input
                                    type="number"
                                    step="1"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={() => saveEdit(p.id, "yield")}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveEdit(p.id, "yield");
                                      if (e.key === "Escape") setEditingCell(null);
                                    }}
                                    placeholder="Qty"
                                    className="w-16 px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-xs text-center focus:outline-none"
                                    autoFocus
                                  />
                                );
                              }
                              return (
                                <span
                                  className="text-xs cursor-pointer hover:text-[var(--brand-olive)]"
                                  onClick={() => startEdit(p.id, "yield", p.yieldCount?.toString() || "")}
                                  title="Click to set yield (units per container)"
                                >
                                  {p.yieldCount ? (
                                    <span className="text-[var(--brand-brown)]">{p.yieldCount} each</span>
                                  ) : (
                                    <span className="text-[var(--ink-muted)]">each →</span>
                                  )}
                                </span>
                              );
                            }
                            const pours = catData?.pourSizes || [];
                            const validPours = pours.filter((ps) => {
                              const amt = ps.amount ?? (ps as any).oz ?? 0;
                              return amt > 0 || ps.label.toLowerCase().includes("full");
                            });
                            if (validPours.length === 0) {
                              return pourOz > 0 ? `${Number.isInteger(pourOz) ? pourOz : pourOz.toFixed(2)}oz` : "—";
                            }
                            const selIdx = selectedPourIdx[p.id] ?? 0;
                            const sel = validPours[selIdx] || validPours[0];
                            const amt = sel.amount ?? (sel as any).oz ?? 0;
                            const u = sel.unit || "oz";
                            const label = amt === 0 ? sel.label : `${Number.isInteger(amt) ? amt : parseFloat(amt.toFixed(2))}${u}`;
                            const isMulti = validPours.length > 1;
                            const isOpen = pourDropdownOpen === p.id;

                            return (
                              <div className="relative inline-block">
                                <button
                                  onClick={() => isMulti && setPourDropdownOpen(isOpen ? null : p.id)}
                                  className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                                    isMulti
                                      ? "bg-[rgba(74,93,39,0.12)] text-[var(--brand-olive-hover)] border border-[var(--brand-olive)] cursor-pointer hover:bg-[rgba(74,93,39,0.12)]"
                                      : "text-[var(--ink-muted)] cursor-default"
                                  }`}
                                  title={isMulti ? validPours.map((ps) => {
                                    const a = ps.amount ?? (ps as any).oz ?? 0;
                                    return a === 0 ? ps.label : `${ps.label}: ${a}${ps.unit || "oz"}`;
                                  }).join("\n") : undefined}
                                >
                                  {label}
                                  {isMulti && <span className="text-[var(--brand-olive)] ml-0.5">▾</span>}
                                </button>
                                {isOpen && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setPourDropdownOpen(null)} />
                                    <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-[var(--line)] rounded-lg shadow-lg py-1 min-w-[140px]">
                                      {validPours.map((ps, i) => {
                                        const a = ps.amount ?? (ps as any).oz ?? 0;
                                        const uu = ps.unit || "oz";
                                        const cost = getPourCostForSize(p, ps);
                                        return (
                                          <button
                                            key={i}
                                            onClick={() => {
                                              setSelectedPourIdx({ ...selectedPourIdx, [p.id]: i });
                                              setPourDropdownOpen(null);
                                            }}
                                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#FAF7F1] flex items-center justify-between gap-3 ${
                                              i === (selIdx || 0) ? "bg-[#FAF7F1] font-medium" : ""
                                            }`}
                                          >
                                            <span>{ps.label} {a > 0 ? `(${a}${uu})` : ""}</span>
                                            <span className="text-[var(--brand-olive)]">{cost > 0 ? formatCents(cost) : "—"}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        {/* Pour Cost — reactive to selected pour OR cost-per-unit for yield items */}
                        <td className="px-2 py-2 text-right">
                          {(() => {
                            // Yield-based cost for NONE serving style items
                            if (catData?.servingStyle === "NONE") {
                              if (p.yieldCount && p.yieldCount > 0 && p.bottleCostCents) {
                                const perUnit = Math.round(p.bottleCostCents / p.yieldCount);
                                return (
                                  <span className="text-xs text-[var(--brand-olive)]" title={`${formatCents(p.bottleCostCents)} \u00f7 ${p.yieldCount} = ${formatCents(perUnit)} per ${p.yieldUnit || "unit"}`}>
                                    {formatCents(perUnit)}
                                  </span>
                                );
                              }
                              return <span className="text-xs text-[var(--ink-muted)]">—</span>;
                            }
                            const pours = catData?.pourSizes || [];
                            const validPours = pours.filter((ps) => {
                              const amt = ps.amount ?? (ps as any).oz ?? 0;
                              return amt > 0 || ps.label.toLowerCase().includes("full");
                            });
                            let cost = pourCost;
                            if (validPours.length > 0) {
                              const selIdx = selectedPourIdx[p.id] ?? 0;
                              const sel = validPours[selIdx] || validPours[0];
                              cost = getPourCostForSize(p, sel);
                            }
                            const isMulti = validPours.length > 1;
                            return (
                              <span
                                className={`text-xs ${cost > 0 ? "text-[var(--brand-olive)]" : "text-[var(--ink-muted)]"} ${isMulti ? "cursor-help" : ""}`}
                                title={isMulti ? validPours.map((ps) => {
                                  const a = ps.amount ?? (ps as any).oz ?? 0;
                                  const c = getPourCostForSize(p, ps);
                                  return `${ps.label}${a > 0 ? ` (${a}${ps.unit || "oz"})` : ""}: ${c > 0 ? formatCents(c) : "—"}`;
                                }).join("\n") : undefined}
                              >
                                {cost > 0 ? formatCents(cost) : "—"}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Suggested Price — reactive to selected pour */}
                        <td className="px-2 py-2 text-right">
                          {(() => {
                            const pours = catData?.pourSizes || [];
                            const validPours = pours.filter((ps) => {
                              const amt = ps.amount ?? (ps as any).oz ?? 0;
                              return amt > 0 || ps.label.toLowerCase().includes("full");
                            });
                            let sug = suggested;
                            if (validPours.length > 0) {
                              const selIdx = selectedPourIdx[p.id] ?? 0;
                              const sel = validPours[selIdx] || validPours[0];
                              const cost = getPourCostForSize(p, sel);
                              sug = getSuggestedForCost(cost, p);
                            }
                            return (
                              <span className={`text-xs ${sug > 0 ? "text-green-600" : "text-[var(--ink-muted)]"}`}>
                                {sug > 0 ? formatCents(sug) : "—"}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Stores */}
                        <td className="px-2 py-2 text-center">
                          <span className="text-xs text-[var(--ink-muted)]">{p.locationCount}/{locations.length}</span>
                        </td>

                        {/* Actions */}
                        <td className="px-2 py-2 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <Link
                              href={`/dashboard/products/${p.id}/edit`}
                              className="p-1 text-[var(--ink-muted)] hover:text-[var(--brand-olive)] transition-colors"
                              title="Edit full details"
                              onClick={() => {
                                // Save current scroll + highlight RIGHT BEFORE navigation
                                try {
                                  if (scrollContainerRef.current) {
                                    sessionStorage.setItem("meyhouse_productScroll", String(scrollContainerRef.current.scrollTop));
                                  }
                                  sessionStorage.setItem("meyhouse_productHighlight", p.id);
                                } catch {}
                                setHighlightedRowRaw(p.id);
                              }}
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </Link>
                            {p.menuStatus === "ON_MENU" ? (
                              <div className="relative">
                                <button
                                  onClick={() => setRemoveMenuOpen(removeMenuOpen === p.id ? null : p.id)}
                                  className="p-1 text-[var(--ink-muted)] hover:text-red-600 transition-colors"
                                  title="Remove from menu"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                {removeMenuOpen === p.id && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setRemoveMenuOpen(null)} />
                                    <div className="absolute right-0 top-7 bg-white border border-[var(--line)] rounded-lg shadow-lg z-50 w-60 py-1">
                                      {(() => {
                                        // "Mark to Remove" is location-scoped: a specific store (when one is
                                        // picked) or every store the product lives in (All Locations). The item
                                        // stays on the menu until its stock runs out, then it surfaces in the
                                        // Phasing Out review list for a Database-vs-Delete decision.
                                        const targetInvs = locationFilter === "ALL"
                                          ? p.inventory
                                          : p.inventory.filter((i) => i.locationId === locationFilter);
                                        const allPending = targetInvs.length > 0 && targetInvs.every((i) => i.markedForRemoval === "PENDING");
                                        const scopeLabel = locationFilter === "ALL" ? "all stores" : "this store";
                                        return (
                                          <button
                                            onClick={async () => {
                                              saveScroll();
                                              for (const inv of targetInvs) {
                                                await toggleMarkForRemoval(p.id, inv.locationId, allPending ? null : "PENDING");
                                              }
                                              setRemoveMenuOpen(null);
                                            }}
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 transition-colors border-b border-[var(--line)]"
                                          >
                                            <p className="font-medium text-amber-700">{allPending ? "Cancel Phase-Out" : "Mark to Remove"}</p>
                                            <p className="text-[10px] text-[var(--ink-muted)]">{allPending ? `Stop phasing out (${scopeLabel})` : `Keep until stock runs out (${scopeLabel}), then decide`}</p>
                                          </button>
                                        );
                                      })()}
                                      <button
                                        onClick={async () => {
                                          await moveProductToDatabase(p.id);
                                          setRemoveMenuOpen(null);
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--brand-cream)] transition-colors"
                                      >
                                        <p className="font-medium text-[var(--brand-brown)]">Move to Product Database</p>
                                        <p className="text-[10px] text-[var(--ink-muted)]">Tasted but not on menu yet</p>
                                      </button>
                                      <button
                                        onClick={async () => {
                                          if (!confirm(`Permanently delete "${p.name}"? This cannot be undone.`)) return;
                                          await hardDeleteProduct(p.id);
                                          setRemoveMenuOpen(null);
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 transition-colors"
                                      >
                                        <p className="font-medium text-red-600">Permanently Delete</p>
                                        <p className="text-[10px] text-[var(--ink-muted)]">Removes from database — cannot be undone</p>
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={async () => {
                                  await moveProductToMenu(p.id);
                                }}
                                className="p-1 text-[var(--ink-muted)] hover:text-green-600 transition-colors"
                                title="Restore to menu"
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Floating mini edit toolbar (Word-style popup) — quick Par-per-store editing + store selection */}
      {mode === "products" && floatingEditProductId && floatingEditPos && (() => {
        const product = products.find((p) => p.id === floatingEditProductId);
        if (!product) return null;
        const toggleStore = (locId: string) => {
          setSelectedLocationsDraft((prev) =>
            prev.includes(locId) ? prev.filter((id) => id !== locId) : [...prev, locId]
          );
        };
        return (
          <div
            data-floating-edit
            className="fixed z-50 bg-white border border-[var(--line)] rounded-xl shadow-xl p-3 w-[340px]"
            style={{
              top: `${Math.max(10, floatingEditPos.top - 220)}px`,
              left: `${Math.max(10, floatingEditPos.left)}px`,
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-[var(--brand-brown)] truncate pr-2">{product.name}</p>
              <button onClick={closeFloatingEdit} className="text-[var(--ink-muted)] hover:text-[var(--brand-brown)] text-sm leading-none" title="Close">✕</button>
            </div>

            {/* Available at stores */}
            <div className="mb-3">
              <p className="text-[10px] uppercase text-[var(--ink-muted)] font-medium mb-1">Available at Stores</p>
              <div className="flex flex-wrap gap-1">
                {locations.map((loc) => {
                  const isSelected = selectedLocationsDraft.includes(loc.id);
                  const shortName = loc.name.replace("Meyhouse ", "");
                  return (
                    <button
                      key={loc.id}
                      onClick={() => toggleStore(loc.id)}
                      className={`px-2 py-1 rounded-md text-[10px] font-medium border transition-colors ${
                        isSelected
                          ? "bg-[rgba(74,93,39,0.12)] border-[var(--brand-olive)] text-[var(--brand-olive-hover)]"
                          : "bg-[var(--brand-cream)] border-[var(--line)] text-[var(--ink-muted)] hover:bg-[var(--brand-cream)]"
                      }`}
                    >
                      {isSelected && "✓ "}{shortName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Par per store */}
            <div className="space-y-1.5 mb-2">
              <p className="text-[10px] uppercase text-[var(--ink-muted)] font-medium">Par Level per Store</p>
              {selectedLocationsDraft.length === 0 ? (
                <p className="text-xs text-[var(--ink-muted)] italic">No stores selected</p>
              ) : (
                selectedLocationsDraft.map((locId) => {
                  const loc = locations.find((l) => l.id === locId);
                  if (!loc) return null;
                  const inv = product.inventory.find((i) => i.locationId === locId);
                  const isNew = !inv;
                  return (
                    <div key={locId} className="flex items-center justify-between gap-2">
                      <label className="text-xs text-[var(--ink-muted)] truncate flex-1">
                        {loc.name.replace("Meyhouse ", "")}
                        {isNew && <span className="text-[9px] text-[var(--brand-olive)] ml-1">(new)</span>}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={parDraft[locId] ?? ""}
                        onChange={(e) => setParDraft({ ...parDraft, [locId]: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); saveFloatingParChanges(); }
                          if (e.key === "Escape") closeFloatingEdit();
                        }}
                        placeholder="0"
                        className="w-16 px-2 py-1 bg-[var(--brand-cream)] border border-[var(--line)] rounded text-xs text-right focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                      />
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-[var(--line)]">
              <button
                onClick={saveFloatingParChanges}
                className="flex-1 px-3 py-1.5 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-xs font-medium"
              >
                Save
              </button>
              <Link
                href={`/dashboard/products/${product.id}/edit`}
                onClick={() => {
                  try {
                    if (scrollContainerRef.current) {
                      sessionStorage.setItem("meyhouse_productScroll", String(scrollContainerRef.current.scrollTop));
                    }
                    sessionStorage.setItem("meyhouse_productHighlight", product.id);
                  } catch {}
                }}
                className="px-3 py-1.5 bg-[var(--brand-cream)] hover:bg-[var(--line)] text-[var(--brand-brown)] rounded-lg text-xs font-medium"
              >
                Edit Full Details
              </Link>
            </div>
            <p className="text-[10px] text-[var(--ink-muted)] mt-1.5 text-center">Press Enter to save · Esc to cancel</p>
          </div>
        );
      })()}

      {/* ===== BULK ACTION BAR (Products mode, selection > 0) =====
          Sticky to the bottom of the viewport. Only shows when 1+ products
          are selected. Provides bulk Add-to-location (with optional par level)
          and bulk Remove-from-location (with a confirm dialog). */}
      {mode === "products" && selectedIds.size > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 bg-white border-t border-[var(--line)] shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
          role="region"
          aria-label="Bulk product actions"
        >
          <div className="max-w-screen-2xl mx-auto px-4 lg:px-8 py-3 flex flex-wrap items-center gap-3">
            {/* Selection count + Clear */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm font-medium text-[var(--brand-brown)]">
                {selectedIds.size} {selectedIds.size === 1 ? "product" : "products"} selected
              </span>
              <button
                type="button"
                onClick={clearSelection}
                disabled={bulkBusy}
                className="text-xs text-[var(--brand-olive)] hover:underline disabled:opacity-50"
              >
                Clear
              </button>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-6 bg-[var(--line)]" />

            {/* Add to location */}
            <div className="flex items-center gap-2 flex-wrap">
              <Plus className="w-3.5 h-3.5 text-[var(--ink-muted)]" aria-hidden="true" />
              <label className="text-xs text-[var(--ink-muted)]">Add to</label>
              <select
                value={bulkAddLocationId}
                onChange={(e) => setBulkAddLocationId(e.target.value)}
                disabled={bulkBusy}
                className="px-2 py-1 bg-white border border-[var(--line)] rounded text-xs text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] disabled:opacity-50"
                aria-label="Location to add selected products to"
              >
                <option value="">Choose location…</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name.replace("Meyhouse ", "")}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min="0"
                value={bulkAddPar}
                onChange={(e) => setBulkAddPar(e.target.value)}
                disabled={bulkBusy}
                placeholder="par (optional)"
                aria-label="Par level for newly added products (optional)"
                className="w-24 px-2 py-1 bg-white border border-[var(--line)] rounded text-xs text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] disabled:opacity-50"
              />
              <button
                type="button"
                onClick={applyBulkAdd}
                disabled={bulkBusy || !bulkAddLocationId}
                className="px-3 py-1 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-colors"
              >
                {bulkBusy ? "Applying…" : "Apply"}
              </button>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-6 bg-[var(--line)]" />

            {/* Remove from location */}
            <div className="flex items-center gap-2 flex-wrap">
              <XCircle className="w-3.5 h-3.5 text-[var(--ink-muted)]" aria-hidden="true" />
              <label className="text-xs text-[var(--ink-muted)]">Remove from</label>
              <select
                value={bulkRemoveLocationId}
                onChange={(e) => setBulkRemoveLocationId(e.target.value)}
                disabled={bulkBusy}
                className="px-2 py-1 bg-white border border-[var(--line)] rounded text-xs text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] disabled:opacity-50"
                aria-label="Location to remove selected products from"
              >
                <option value="">Choose location…</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name.replace("Meyhouse ", "")}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={applyBulkRemove}
                disabled={bulkBusy || !bulkRemoveLocationId}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-colors"
              >
                {bulkBusy ? "Applying…" : "Apply"}
              </button>
            </div>

            {/* Inline banner */}
            {bulkBanner && (
              <div
                className={`ml-auto text-xs px-3 py-1 rounded ${
                  bulkBanner.kind === "success"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
                role="status"
              >
                {bulkBanner.text}
              </div>
            )}
          </div>
        </div>
      )}

      {/* === MODE 2: INVENTORY (R365-style Variance Review) === */}
      {mode === "inventory" && (
        <div>

          {!selectedStoreId ? (
            <div className="bg-white border border-[var(--line)] rounded-xl p-8 text-center">
              <ClipboardList className="w-10 h-10 text-[var(--ink-muted)] mx-auto mb-3" />
              <h2 className="text-lg font-semibold mb-1">Select a store to start counting</h2>
              <p className="text-sm text-[var(--ink-muted)]">Pick a location above, then walk through each storage area.</p>
            </div>
          ) : (
            <div className="bg-white border border-[var(--line)] rounded-xl">
                          <table className="w-full min-w-[1100px] text-xs table-fixed">
                            <thead className="sticky top-0 z-10">
                              <tr className="bg-[var(--brand-cream)] border-b border-[var(--line)] text-[10px] text-[var(--ink-muted)] uppercase font-medium">
                                <th className="text-left px-2 py-2 w-[17%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleOrderSort("name")}>
                                  <span className="flex items-center gap-1">Item <OrderSortIcon field="name" /></span>
                                </th>
                                <th className="text-left px-2 py-2 w-[5%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleOrderSort("size")}>
                                  <span className="flex items-center gap-1">Size <OrderSortIcon field="size" /></span>
                                </th>
                                <th className="text-left px-2 py-2 w-[7%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleOrderSort("vendor")}>
                                  <span className="flex items-center gap-1">Vendor <OrderSortIcon field="vendor" /></span>
                                </th>
                                <th className="text-right px-2 py-2 w-[6%]">Cost</th>
                                <th className="text-right px-2 py-2 w-[6%]">Previous</th>
                                <th className="text-right px-2 py-2 w-[7%]">Purchases</th>
                                <th className="text-right px-2 py-2 w-[6%]">Transfers</th>
                                <th className="text-center px-2 py-2 w-[7%] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleOrderSort("count")}>
                                  <span className="flex items-center justify-center gap-1">Count <OrderSortIcon field="count" /></span>
                                </th>
                                <th className="text-right px-2 py-2 w-[7%]">Actual Usage</th>
                                <th className="text-right px-2 py-2 w-[7%]">Theoretical</th>
                                <th className="text-right px-2 py-2 w-[5%]">Waste</th>
                                <th className="text-right px-2 py-2 w-[7%]">Variance</th>
                                <th className="text-right px-2 py-2 w-[6%]">Var $</th>
                                <th className="text-right px-2 py-2 w-[7%]">Efficiency</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--line)]">
                              {flatInventoryItems.map((item) => {
                                const countVal = inventoryCounts[item.inv.id] ?? "";
                                const hasCount = countVal !== "";
                                const countNum = hasCount ? parseFloat(countVal) || 0 : null;
                                const isSaved = savedItems.has(item.inv.id);

                                const prev = item.inv.currentStock;
                                const purchased = item.inv.purchasesSinceLastCount;
                                const transfers = 0;
                                const expected = prev + purchased + transfers;
                                const actualUsage = countNum !== null ? expected - countNum : null;
                                const theoretical = theoreticalUsage[`${item.id}_${selectedStoreId}`] ?? 0;
                                const waste = 0;
                                const variance = actualUsage !== null ? actualUsage - theoretical - waste : null;
                                const varianceDollars = variance !== null && item.bottleCostCents
                                  ? (variance * item.bottleCostCents) / 100
                                  : null;
                                const efficiency = actualUsage !== null && actualUsage > 0 && theoretical > 0
                                  ? (theoretical / actualUsage) * 100
                                  : null;

                                const invMarkerColor =
                                  item.inv.markedForRemoval === "INACTIVE" ? "bg-red-50/60" :
                                  item.inv.markedForRemoval === "DATABASE" ? "bg-yellow-50/80" :
                                  item.inv.isCraftCocktailIngredient ? "bg-teal-50/70" :
                                  item.inv.isWellSpirit ? "bg-blue-50/70" :
                                  item.inv.isHalfBottle ? "bg-orange-50/70" :
                                  item.inv.isDessertWine ? "bg-emerald-50/70" :
                                  "";
                                return (
                                  <tr
                                    key={item.inv.id}
                                    onClick={(e) => {
                                      if ((e.target as HTMLElement).closest("input, select, button, a")) return;
                                      setHighlightedRow(highlightedRow === item.inv.id ? null : item.inv.id);
                                    }}
                                    className={`hover:bg-[var(--brand-cream)] cursor-pointer transition-colors ${
                                      highlightedRow === item.inv.id ? "!bg-[#FAF7F1] ring-1 ring-[var(--brand-olive)]" :
                                      isSaved ? "bg-green-50/50" : hasCount ? "bg-[#FAF7F1]" :
                                      invMarkerColor
                                    }`}
                                  >
                                    <td className="px-2 py-2">
                                      <p className="font-medium whitespace-nowrap">
                                        {item.name}
                                        {item.inv.markedForRemoval === "DATABASE" && <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 py-0.5 rounded ml-1" title="Marked for Database">→ DB</span>}
                                        {item.inv.markedForRemoval === "INACTIVE" && <span className="text-[9px] bg-red-100 text-red-600 px-1 py-0.5 rounded ml-1" title="Marked to Delete">→ ✕</span>}
                                        {item.inv.isCraftCocktailIngredient && <span className="text-[9px] bg-teal-100 text-teal-700 px-1 py-0.5 rounded ml-1" title="Craft Cocktail">CC</span>}
                                        {item.inv.isWellSpirit && <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded ml-1" title="Well Spirit">Well</span>}
                                        {item.inv.isHalfBottle && <span className="text-[9px] bg-orange-100 text-orange-700 px-1 py-0.5 rounded ml-1" title="Half Bottle">½</span>}
                                        {item.inv.isDessertWine && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded ml-1" title="Dessert Wine">🍇</span>}
                                      </p>
                                    </td>
                                    <td className="px-2 py-2 text-[var(--ink-muted)] text-[10px]">
                                      {item.bottleSizeMl ? formatSize(item.bottleSizeMl, item.bottleSizeUnit || "ml") : "—"}
                                    </td>
                                    <td className="px-2 py-2 text-[var(--ink-muted)] text-[10px] truncate max-w-[70px]">
                                      {item.vendor || "—"}
                                    </td>
                                    <td className="px-2 py-2 text-right text-[var(--ink-muted)]">
                                      {item.bottleCostCents ? `$${(item.bottleCostCents / 100).toFixed(2)}` : "—"}
                                    </td>
                                    <td className="px-2 py-2 text-right text-blue-600">
                                      {prev.toFixed(prev % 1 === 0 ? 0 : 2)}
                                    </td>
                                    <td className="px-2 py-2 text-right text-[var(--ink-muted)]">
                                      {purchased > 0 ? purchased.toFixed(purchased % 1 === 0 ? 0 : 2) : "0.00"}
                                    </td>
                                    <td className="px-2 py-2 text-right text-[var(--ink-muted)]">0.00</td>
                                    <td className="px-2 py-2 text-center">
                                      <input
                                        type="number"
                                        step="0.01"
                                        inputMode="decimal"
                                        value={countVal}
                                        onChange={(e) => setInventoryCounts({ ...inventoryCounts, [item.inv.id]: e.target.value })}
                                        onBlur={(e) => { if (e.target.value !== "") handleCountSave(item.inv.id, e.target.value); }}
                                        placeholder="—"
                                        className={`w-16 px-1.5 py-1 border rounded text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] ${
                                          isSaved ? "bg-green-100 border-green-400" : "bg-white border-[var(--line)]"
                                        }`}
                                      />
                                      {isSaved && <span className="text-[9px] text-green-600 block">✓</span>}
                                    </td>
                                    <td className="px-2 py-2 text-right">
                                      {actualUsage !== null ? (
                                        <span className={actualUsage < 0 ? "text-red-600" : "text-[var(--brand-brown)]"}>
                                          {actualUsage < 0 ? `(${Math.abs(actualUsage).toFixed(2)})` : actualUsage.toFixed(2)}
                                        </span>
                                      ) : <span className="text-[var(--ink-muted)]">—</span>}
                                    </td>
                                    <td className="px-2 py-2 text-right text-[var(--ink-muted)]">
                                      {theoretical > 0 ? theoretical.toFixed(2) : "0.00"}
                                    </td>
                                    <td className="px-2 py-2 text-right text-[var(--ink-muted)]">0.00</td>
                                    <td className="px-2 py-2 text-right">
                                      {variance !== null ? (
                                        <span className={`font-medium ${variance !== 0 ? "text-red-600" : "text-[var(--ink-muted)]"}`}>
                                          {variance !== 0 ? (variance > 0 ? variance.toFixed(2) : `(${Math.abs(variance).toFixed(2)})`) : "0.00"}
                                        </span>
                                      ) : <span className="text-[var(--ink-muted)]">—</span>}
                                    </td>
                                    <td className="px-2 py-2 text-right">
                                      {varianceDollars !== null ? (
                                        <span className={`font-medium ${varianceDollars !== 0 ? "text-red-600" : "text-[var(--ink-muted)]"}`}>
                                          {varianceDollars !== 0 ? (varianceDollars > 0 ? `$${varianceDollars.toFixed(2)}` : `($${Math.abs(varianceDollars).toFixed(2)})`) : "$0.00"}
                                        </span>
                                      ) : <span className="text-[var(--ink-muted)]">—</span>}
                                    </td>
                                    <td className="px-2 py-2 text-right text-[var(--ink-muted)]">
                                      {efficiency !== null ? `${efficiency.toFixed(1)}%` : "0.00%"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
            </div>
          )}
        </div>
      )}

      {mode === "ordering" && (
        <div>
          {/* Main ordering table — always full width; cart floats over it as a drawer */}
          <div className="min-w-0">

            {!selectedStoreId ? (
              <div className="bg-white border border-[var(--line)] rounded-xl p-8 text-center">
                <ShoppingCart className="w-10 h-10 text-[var(--ink-muted)] mx-auto mb-3" />
                <h2 className="text-lg font-semibold mb-1">Select a store to start ordering</h2>
                <p className="text-sm text-[var(--ink-muted)]">Pick a location, count what you have, and the system auto-generates your order.</p>
              </div>
            ) : (
              <div className="bg-white border border-[var(--line)] rounded-xl">
                  <table ref={orderTableRef} className="w-full min-w-[980px] text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-[var(--brand-cream)] border-b border-[var(--line)] text-[10px] text-[var(--ink-muted)] uppercase font-medium">
                        <th className="text-left px-2 py-2 cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleOrderSort("name")}>
                          <span className="flex items-center gap-1">Product <OrderSortIcon field="name" /></span>
                        </th>
                        <th className="text-left px-2 py-2 w-[55px] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleOrderSort("size")}>
                          <span className="flex items-center gap-1">Size <OrderSortIcon field="size" /></span>
                        </th>
                        <th className="text-center px-2 py-2 w-[70px]">
                          <span className="whitespace-nowrap">Case</span>
                        </th>
                        <th className="text-left px-2 py-2 w-[75px] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleOrderSort("vendor")}>
                          <span className="flex items-center gap-1">Vendor <OrderSortIcon field="vendor" /></span>
                        </th>
                        <th className="text-right px-2 py-2 w-[45px] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleOrderSort("par")}>
                          <span className="flex items-center justify-end gap-1">Par <OrderSortIcon field="par" /></span>
                        </th>
                        <th className="text-right px-2 py-2 w-[55px]">Last</th>
                        <th className="text-center px-2 py-2 w-[55px] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleOrderSort("count")}>
                          <span className="flex items-center justify-center gap-1">Count <OrderSortIcon field="count" /></span>
                        </th>
                        <th className="text-right px-2 py-2 w-[45px] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleOrderSort("need")}>
                          <span className="flex items-center justify-end gap-1">Need <OrderSortIcon field="need" /></span>
                        </th>
                        <th className="text-center px-2 py-2 w-[70px] cursor-pointer hover:text-[var(--brand-brown)]" onClick={() => toggleOrderSort("order")}>
                          <span className="flex items-center justify-center gap-1">Order <OrderSortIcon field="order" /></span>
                        </th>
                        <th className="text-left px-2 py-2">8-Week History</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {flatInventoryItems.map((item) => {
                        const countVal = orderCounts[item.inv.id] ?? "";
                        const hasCount = countVal !== "";
                        const counted = hasCount ? parseFloat(countVal) || 0 : null;
                        const needed = counted !== null ? Math.max(0, item.inv.parLevel - counted) : null;
                        // Case size decides how to order:
                        //   positive number (6, 12, 24) → order by CASE (need ÷ case_size, rounded up)
                        //   negative (Bottle Only, Single, Keg) or 0 → order by UNIT (bottle/keg count)
                        const cps = item.casePackSize || 0;
                        const isCase = cps > 1;
                        const casePack = isCase ? cps : 1;
                        const orderQty = needed !== null && needed > 0
                          ? (isCase ? Math.ceil(needed / casePack) : Math.ceil(needed))
                          : 0;
                        const history = getHistoryLine(item);
                        const isEd = (field: string) => editingCell?.productId === item.id && editingCell?.field === field;

                        const ordMarkerColor =
                          item.inv.markedForRemoval === "INACTIVE" ? "bg-red-50/60" :
                          item.inv.markedForRemoval === "DATABASE" ? "bg-yellow-50/80" :
                          item.inv.isCraftCocktailIngredient ? "bg-teal-50/70" :
                          item.inv.isWellSpirit ? "bg-blue-50/70" :
                          item.inv.isHalfBottle ? "bg-orange-50/70" :
                          "";
                        return (
                          <tr key={item.inv.id}
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest("input, select, button, a")) return;
                              setHighlightedRow(highlightedRow === item.inv.id ? null : item.inv.id);
                            }}
                            className={`hover:bg-[var(--brand-cream)] cursor-pointer transition-colors ${
                              highlightedRow === item.inv.id ? "!bg-[#FAF7F1] ring-1 ring-[var(--brand-olive)]" :
                              hasCount && needed && needed > 0 ? "bg-[#FAF7F1]" :
                              ordMarkerColor
                            }`}>
                            {/* Product name */}
                            <td className="px-2 py-2">
                              <p className="font-medium text-xs whitespace-nowrap">
                                {item.name}
                                {item.inv.markedForRemoval === "DATABASE" && <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 py-0.5 rounded ml-1" title="Marked for Database">→ DB</span>}
                                {item.inv.markedForRemoval === "INACTIVE" && <span className="text-[9px] bg-red-100 text-red-600 px-1 py-0.5 rounded ml-1" title="Marked to Delete">→ ✕</span>}
                                {item.inv.isCraftCocktailIngredient && <span className="text-[9px] bg-teal-100 text-teal-700 px-1 py-0.5 rounded ml-1" title="Craft Cocktail">CC</span>}
                                {item.inv.isWellSpirit && <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded ml-1" title="Well Spirit">Well</span>}
                                {item.inv.isHalfBottle && <span className="text-[9px] bg-orange-100 text-orange-700 px-1 py-0.5 rounded ml-1" title="Half Bottle">½</span>}
                                {item.inv.isDessertWine && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded ml-1" title="Dessert Wine">🍇</span>}
                              </p>
                            </td>
                            {/* Size — click to edit */}
                            <td className="px-2 py-2">
                              {isEd("bottleSize") ? (
                                <select
                                  value={editValue}
                                  onChange={(e) => {
                                    saveScroll();
                                    setEditValue(e.target.value);
                                    setEditingCell(null);
                                    const product = products.find((pr) => pr.id === item.id);
                                    if (product) {
                                      updateProduct(item.id, {
                                        name: product.name,
                                        type: product.type,
                                        vendorId: product.vendorId || undefined,
                                        ingredientCategory: product.ingredientCategory || undefined,
                                        bottleSizeMl: e.target.value ? Number(e.target.value) : undefined,
                                        bottleSizeUnit: "ml",
                                        yieldCount: product.yieldCount ?? null,
                                        yieldUnit: product.yieldUnit ?? null,
                                        casePackSize: product.casePackSize || undefined,
                                        bottleCostCents: product.bottleCostCents || undefined,
                                        locationIds: product.locationIds,
                                      });
                                    }
                                  }}
                                  onBlur={() => setEditingCell(null)}
                                  className="w-full px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-[10px] focus:outline-none"
                                  autoFocus
                                >
                                  <option value="">—</option>
                                  {(() => {
                                    const sorted = sortBottleSizes(bottleSizes);
                                    const groups: Record<SizeGroup, number[]> = { ml: [], oz: [], weight: [], keg: [] };
                                    sorted.forEach((s) => groups[classifySize(s)].push(s));
                                    const labels: Record<SizeGroup, string> = { ml: "Milliliters", oz: "Ounces", weight: "Weight", keg: "Kegs / Large" };
                                    return (["ml", "oz", "weight", "keg"] as SizeGroup[]).map((g) =>
                                      groups[g].length > 0 ? (
                                        <optgroup key={g} label={labels[g]}>
                                          {groups[g].map((s) => (
                                            <option key={s} value={s}>{formatSizeMl(s)}</option>
                                          ))}
                                        </optgroup>
                                      ) : null
                                    );
                                  })()}
                                </select>
                              ) : (
                                <span
                                  className="text-[10px] text-[var(--ink-muted)] cursor-pointer hover:text-[var(--brand-olive)]"
                                  onClick={() => startEdit(item.id, "bottleSize", item.bottleSizeMl?.toString() || "")}
                                >
                                  {item.bottleSizeMl ? formatSize(item.bottleSizeMl, item.bottleSizeUnit || "ml") : "—"}
                                </span>
                              )}
                            </td>
                            {/* Case size (read-only) */}
                            <td className="px-2 py-2 text-center text-[10px] text-[var(--ink-muted)] whitespace-nowrap">
                              {formatCaseSize(item.casePackSize)}
                            </td>
                            {/* Vendor — click to edit */}
                            <td className="px-2 py-2">
                              {isEd("vendor") ? (
                                <select
                                  value={editValue}
                                  onChange={(e) => {
                                    if (e.target.value === "__add__") {
                                      setEditingCell(null);
                                      setAddVendorFor(item.id);
                                      return;
                                    }
                                    setEditValue(e.target.value);
                                  }}
                                  onBlur={() => saveEdit(item.id, "vendor")}
                                  className="w-full px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-[10px] focus:outline-none"
                                  autoFocus
                                >
                                  <option value="__add__">+ Add new vendor…</option>
                                  <option value="">—</option>
                                  {vendorList.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                                </select>
                              ) : (
                                <span
                                  className="text-[10px] text-[var(--ink-muted)] cursor-pointer hover:text-[var(--brand-olive)] truncate block"
                                  onClick={() => startEdit(item.id, "vendor", item.vendorId || "")}
                                >
                                  {item.vendor || "—"}
                                </span>
                              )}
                            </td>
                            {/* Par — click to edit */}
                            <td className="px-2 py-2 text-right">
                              {isEd("par") ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => {
                                    handleParSave(item.inv.id, editValue);
                                    setEditingCell(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") { handleParSave(item.inv.id, editValue); setEditingCell(null); }
                                    if (e.key === "Escape") setEditingCell(null);
                                  }}
                                  className="w-12 px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-xs text-right focus:outline-none"
                                  autoFocus
                                />
                              ) : (
                                <span
                                  className="text-xs text-[var(--brand-brown)] cursor-pointer hover:text-[var(--brand-olive)]"
                                  onClick={() => startEdit(item.id, "par", item.inv.parLevel.toString())}
                                >
                                  {item.inv.parLevel}
                                </span>
                              )}
                            </td>
                            {/* Last Count */}
                            <td className="px-2 py-2 text-right text-xs text-[var(--ink-muted)]">{item.inv.currentStock}</td>
                            {/* Count input */}
                            <td className="px-2 py-2 text-center">
                              <input
                                type="number"
                                step="0.01"
                                inputMode="decimal"
                                value={countVal}
                                onChange={(e) => setOrderCounts({ ...orderCounts, [item.inv.id]: e.target.value })}
                                placeholder="—"
                                className="w-14 px-1 py-1 border border-[var(--line)] rounded text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                              />
                            </td>
                            {/* Need */}
                            <td className="px-2 py-2 text-right">
                              {needed !== null && needed > 0 ? (
                                <span className="text-xs text-[var(--brand-olive)] font-medium">{needed}</span>
                              ) : needed !== null ? (
                                <span className="text-xs text-green-600">✓</span>
                              ) : <span className="text-xs text-[var(--ink-muted)]">—</span>}
                            </td>
                            {/* Order — click to edit qty + case/bottle */}
                            <td className="px-2 py-2 text-center">
                              {isEd("orderQty") ? (
                                <div className="flex items-center gap-1 justify-center">
                                  <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={editValue.split(":")[0] || ""}
                                    onChange={(e) => {
                                      const unit = editValue.split(":")[1] || (isCase ? "cs" : "btl");
                                      setEditValue(`${e.target.value}:${unit}`);
                                    }}
                                    className="w-10 px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-xs text-center focus:outline-none"
                                    autoFocus
                                  />
                                  <select
                                    value={editValue.split(":")[1] || (isCase ? "cs" : "btl")}
                                    onChange={(e) => {
                                      const qty = editValue.split(":")[0] || "0";
                                      setEditValue(`${qty}:${e.target.value}`);
                                    }}
                                    onBlur={() => setEditingCell(null)}
                                    className="px-1 py-0.5 bg-[#FAF7F1] border border-[var(--brand-olive)] rounded text-[10px] focus:outline-none"
                                  >
                                    <option value="btl">btl</option>
                                    <option value="cs">case</option>
                                  </select>
                                </div>
                              ) : orderQty > 0 ? (
                                <span
                                  className="text-xs text-[var(--brand-olive-hover)] font-bold cursor-pointer hover:text-[var(--brand-olive-hover)]"
                                  onClick={() => startEdit(item.id, "orderQty", `${orderQty}:${orderUnitLabel(item.casePackSize, isCase)}`)}
                                >
                                  {orderQty} {orderUnitLabel(item.casePackSize, isCase)}
                                </span>
                              ) : <span className="text-xs text-[var(--ink-muted)]">—</span>}
                            </td>
                            {/* 8-Week History */}
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-2 text-[10px] text-[var(--ink-muted)]">
                                <span className="text-[var(--ink-muted)]">Last 8:</span>
                                <span className="font-mono">{history.weekly.join("·")}</span>
                                <span className="text-[var(--ink-muted)]">|</span>
                                <span>Wk: <span className="text-[var(--brand-brown)]">{history.weeklyAvg.toFixed(1)}</span></span>
                                <span className="text-[var(--ink-muted)]">|</span>
                                <span>Mo: <span className="text-[var(--brand-brown)]">{history.monthlyAvg.toFixed(1)}</span></span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
              </div>
            )}
          </div>

          {/* ===== ORDER CART — right-side slide-over drawer ===== */}
          {/* Dimmed backdrop — click to close */}
          {showCart && (
            <div
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setShowCart(false)}
              aria-hidden="true"
            />
          )}
          {/* Drawer: stays mounted, slides in/out via transform so it floats
              over the table without ever shrinking it. */}
          <div
            className={`fixed top-0 right-0 h-screen w-[420px] max-w-[90vw] bg-white border-l border-[var(--line)] shadow-xl flex flex-col z-50 transition-transform duration-200 ${
              showCart ? "translate-x-0" : "translate-x-full"
            }`}
            role="dialog"
            aria-label={useMergedOrderCart ? "Merged Order Cart" : "Order Cart"}
            aria-hidden={!showCart}
          >
              <div className="p-4 border-b border-[var(--line)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-[var(--brand-olive)]" />
                  <h2 className="font-bold">{useMergedOrderCart ? "Merged Order Cart" : "Order Cart"}</h2>
                  <span className="text-xs text-[var(--ink-muted)]">({cartItems.length})</span>
                </div>
                <button
                  onClick={() => setShowCart(false)}
                  className="text-[var(--ink-muted)] hover:text-[var(--brand-brown)] text-lg"
                  aria-label="Close cart"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {cartItems.length === 0 ? (
                  <div className="text-center py-8 text-[var(--ink-muted)] text-sm">
                    <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>Cart is empty</p>
                    <p className="text-xs mt-1">Enter counts below par to add items</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cartGrouped.map(([vendor, vendorItems]) => {
                      // Sub-group by store within each vendor
                      const byStore = new Map<string, CartItem[]>();
                      for (const ci of vendorItems) {
                        const key = ci.locationName || "Unknown";
                        if (!byStore.has(key)) byStore.set(key, []);
                        byStore.get(key)!.push(ci);
                      }
                      return (
                        <div key={vendor}>
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-xs font-bold text-[var(--brand-brown)] uppercase">{vendor}</span>
                            <span className="text-xs text-[var(--ink-muted)]">({vendorItems.length})</span>
                          </div>
                          {[...byStore.entries()].map(([storeName, storeItems]) => (
                            <div key={storeName} className="mb-2">
                              {useMergedOrderCart && (
                                <p className="text-xs text-[var(--brand-olive-hover)] font-bold ml-1 mb-0.5">{storeName}</p>
                              )}
                              <div className="space-y-1">
                                {storeItems.map((ci, idx) => {
                                  const cartKey = `${ci.productId}_${ci.locationId}`;
                                  const isEditingThis = editingCartItem === cartKey;
                                  return (
                                  <div key={`${ci.productId}-${ci.locationId}-${idx}`} className="bg-[var(--brand-cream)] rounded px-2 py-1.5 text-xs">
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1 min-w-0 mr-2">
                                        <p className="truncate font-medium">{ci.productName}</p>
                                        <p className="text-[10px] text-[var(--ink-muted)]">
                                          Par {ci.parLevel} · Had {ci.counted}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        {/* Editable qty + unit */}
                                        <input
                                          type="number"
                                          min="1"
                                          step="1"
                                          value={ci.orderQty}
                                          onChange={(e) => {
                                            const val = parseInt(e.target.value) || 1;
                                            setCartOverrides({ ...cartOverrides, [cartKey]: { ...cartOverrides[cartKey], orderQty: val } });
                                          }}
                                          className="w-8 px-0.5 py-0.5 border border-[var(--line)] rounded text-[10px] text-center font-bold focus:outline-none focus:ring-1 focus:ring-[var(--brand-olive)]"
                                        />
                                        <select
                                          value={ci.orderUnit}
                                          onChange={(e) => {
                                            setCartOverrides({ ...cartOverrides, [cartKey]: { ...cartOverrides[cartKey], orderUnit: e.target.value } });
                                          }}
                                          className="px-0.5 py-0.5 border border-[var(--line)] rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-[var(--brand-olive)]"
                                        >
                                          <option value="bottle">btl</option>
                                          <option value="case">case</option>
                                        </select>
                                        <button
                                          onClick={() => removeFromCart(ci.productId, ci.locationId)}
                                          className="ml-0.5 text-[var(--ink-muted)] hover:text-red-500"
                                          title="Remove from cart"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </div>
                                    {/* Store reassignment — click store name to change */}
                                    {useMergedOrderCart && (
                                      <div className="mt-1 flex items-center gap-1">
                                        <span className="text-[9px] text-[var(--ink-muted)]">Store:</span>
                                        <select
                                          value={ci.locationId}
                                          onChange={(e) => {
                                            const newLoc = locations.find((l) => l.id === e.target.value);
                                            setCartOverrides({
                                              ...cartOverrides,
                                              [cartKey]: {
                                                ...cartOverrides[cartKey],
                                                locationId: e.target.value,
                                                locationName: newLoc?.name?.replace("Meyhouse ", "") || "",
                                              },
                                            });
                                          }}
                                          className="text-[9px] px-1 py-0 border border-[var(--line)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--brand-olive)] bg-white"
                                        >
                                          {locations.map((l) => (
                                            <option key={l.id} value={l.id}>
                                              {l.name.replace("Meyhouse ", "")}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    )}
                                  </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {cartItems.length > 0 && (
                <div className="p-4 border-t border-[var(--line)] bg-[var(--brand-cream)]">
                  <div className="flex justify-between text-sm mb-3">
                    <span className="text-[var(--ink-muted)]">Total: {cartItems.length} items</span>
                    <span className="font-bold text-[var(--brand-olive-hover)]">
                      {cartTotal > 0 ? `$${cartTotal.toFixed(2)}` : "—"}
                    </span>
                  </div>
                  {submitResult && (
                    <div className={`rounded-lg px-3 py-2 mb-2 text-xs ${submitResult.kind === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                      {submitResult.kind === "success" ? "✓ " : ""}{submitResult.text}
                    </div>
                  )}
                  <p className="text-[10px] text-[var(--ink-muted)] mb-2 text-center">
                    Auto-saved as you work. Submit when ready for owner approval.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSubmitForApproval}
                      disabled={submitting || cartItems.length === 0}
                      className="flex-1 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {submitting ? "Submitting..." : "Submit for Approval"}
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="px-3 py-2 bg-[var(--brand-cream)] hover:bg-[var(--line)] rounded-lg text-xs transition-colors"
                    >
                      Print
                    </button>
                  </div>
                  {canApprove && (
                    <Link
                      href="/dashboard/inventory/orders/review"
                      className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1"
                    >
                      <ClipboardList className="w-3 h-3" />
                      Review &amp; Approve Orders
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      if (confirm("Clear all items from the cart? This will reset all counts.")) {
                        handleClearCart();
                      }
                    }}
                    className="w-full mt-2 py-2 bg-[var(--brand-cream)] hover:bg-red-50 hover:text-red-600 text-[var(--ink-muted)] rounded-lg text-xs transition-colors"
                  >
                    Clear All Items
                  </button>
                </div>
              )}
          </div>{/* end cart drawer */}

          {/* Email Preview Modal — rendered outside the transformed drawer so its
              fixed positioning is relative to the viewport, not the drawer. */}
          {showEmailPreview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                  <div className="fixed inset-0 bg-black/40" onClick={() => setShowEmailPreview(false)} />
                  <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto m-4 z-50">
                    <div className="sticky top-0 bg-white border-b border-[var(--line)] p-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mail className="w-5 h-5 text-blue-600" />
                        <h2 className="font-bold text-lg">Email Preview</h2>
                        <span className="text-xs text-[var(--ink-muted)]">
                          ({emailPreviews.length} vendor{emailPreviews.length !== 1 ? "s" : ""})
                        </span>
                      </div>
                      <button
                        onClick={() => setShowEmailPreview(false)}
                        className="text-[var(--ink-muted)] hover:text-[var(--brand-brown)] text-xl"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="p-4 space-y-4">
                      {emailResult && (
                        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
                          {emailResult.results.map((r: any, i: number) => (
                            <p key={i}>
                              {r.status === "SENT" ? "✓" : r.status === "DRAFT" ? "📝" : "✕"}{" "}
                              <strong>{r.vendor}</strong>: {r.status}
                              {r.error && <span className="text-red-600"> — {r.error}</span>}
                            </p>
                          ))}
                        </div>
                      )}

                      {emailPreviews.map((email, i) => (
                        <div key={i} className="border border-[var(--line)] rounded-lg overflow-hidden">
                          <div className="bg-[var(--brand-cream)] px-4 py-3 border-b border-[var(--line)]">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-sm">{email.vendor}</p>
                                <p className="text-xs text-[var(--ink-muted)]">
                                  To: {email.recipientEmail || <span className="text-red-500">No email set — add in Vendors</span>}
                                  {email.recipientName && ` (${email.recipientName})`}
                                </p>
                                {email.recipientPhone && (
                                  <p className="text-xs text-[var(--ink-muted)]">Phone: {email.recipientPhone}</p>
                                )}
                              </div>
                              <span className="text-xs text-[var(--ink-muted)]">{email.itemCount} items</span>
                            </div>
                          </div>
                          <div className="px-4 py-3">
                            <p className="text-xs text-[var(--ink-muted)] mb-1">Subject: {email.subject}</p>
                            <pre className="text-xs text-[var(--brand-brown)] whitespace-pre-wrap font-mono bg-[var(--brand-cream)] rounded p-3">
                              {email.body}
                            </pre>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="sticky bottom-0 bg-white border-t border-[var(--line)] p-4 flex gap-2">
                      <button
                        onClick={handleSendEmails}
                        disabled={sendingEmails}
                        className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Mail className="w-4 h-4" />
                        {sendingEmails ? "Sending..." : "Send All Emails"}
                      </button>
                      <button
                        onClick={() => setShowEmailPreview(false)}
                        className="px-4 py-2.5 bg-[var(--brand-cream)] hover:bg-[var(--line)] rounded-lg text-sm transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}
        </div>
      )}

      {mode === "pricing" && <MenuPricingReadOnly />}

      {/* ===== ADD VENDOR — right-side slide-over drawer =====
          Rendered unconditionally (all modes) so the "+ Add new vendor…"
          shortcut works from the Inventory and Order vendor cells. */}
      <AddVendorDrawer
        open={addVendorFor !== null}
        onClose={() => setAddVendorFor(null)}
        assignToLabel={
          addVendorFor
            ? products.find((p) => p.id === addVendorFor)?.name ?? null
            : null
        }
        onCreated={(vendor) => {
          setVendorList((prev) =>
            [...prev, vendor].sort((a, b) => a.name.localeCompare(b.name)),
          );
          if (addVendorFor) {
            assignVendorToProduct(addVendorFor, vendor.id);
          }
        }}
      />
      </div>{/* end scrollable area */}
    </div>
  );
}

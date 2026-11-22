"use client";

// Master Database tab (2026-11-22): every product ever entered (not
// permanently deleted), which restaurants use it, add back / remove / archive,
// and Permanent Delete for Owner / Admin / General Manager only.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { searchMatcher } from "@/lib/search-normalize";
import { addToStores, archiveProduct, cancelRemoval, permanentlyDelete, unarchiveProduct } from "@/lib/actions/master-database";
import { RemoveFromStoresDialog, type RemoveTarget } from "@/components/product/remove-from-stores-dialog";

export type MasterProduct = {
  id: string;
  name: string;
  ingredientCategory: string | null;
  vendor: string | null;
  bottleSizeMl: number | null;
  bottleSizeUnit: string;
  archivedAt?: string | null;
  createdAt?: string;
  storeLinks?: { locationId: string; locationName: string; removedAt: string | null; removedByName: string | null; markedForRemoval: string | null }[];
};

type Filter = "all" | "inUse" | "notInUse" | "removedWeek" | "archived";
const WEEK = 7 * 24 * 3600_000;

export function MasterDatabaseTab({
  products, locations, canPermanentDelete,
}: {
  products: MasterProduct[];
  locations: { id: string; name: string }[];
  canPermanentDelete: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ target: RemoveTarget; preselect: string | null } | null>(null);
  // "Removed this week" is measured from when the tab opened.
  const [openedAt] = useState(() => Date.now());
  const short = (n: string) => n.replace("Meyhouse ", "");

  const rows = useMemo(() => products.map((p) => {
    const links = p.storeLinks ?? [];
    const using = links.filter((l) => !l.removedAt);
    const lastRemoved = links.filter((l) => l.removedAt).map((l) => l.removedAt!).sort().pop() ?? null;
    return { p, links, using, lastRemoved, archived: !!p.archivedAt };
  }), [products]);

  const categories = useMemo(() => [...new Set(products.map((p) => p.ingredientCategory).filter((c): c is string => !!c))].sort(), [products]);

  const counts = useMemo(() => {
    const now = openedAt;
    return {
      all: rows.filter((r) => !r.archived).length,
      inUse: rows.filter((r) => !r.archived && r.using.length > 0).length,
      notInUse: rows.filter((r) => !r.archived && r.using.length === 0).length,
      removedWeek: rows.filter((r) => r.lastRemoved && now - Date.parse(r.lastRemoved) < WEEK).length,
      archived: rows.filter((r) => r.archived).length,
    };
  }, [rows, openedAt]);

  const shown = useMemo(() => {
    const match = searchMatcher(q);
    const now = openedAt;
    return rows.filter((r) => {
      if (filter === "archived" ? !r.archived : filter !== "removedWeek" && r.archived) return false;
      if (filter === "inUse" && r.using.length === 0) return false;
      if (filter === "notInUse" && r.using.length > 0) return false;
      if (filter === "removedWeek" && !(r.lastRemoved && now - Date.parse(r.lastRemoved) < WEEK)) return false;
      if (category !== "ALL" && r.p.ingredientCategory !== category) return false;
      return match(r.p.name, r.p.vendor, r.p.ingredientCategory);
    });
  }, [rows, q, filter, category, openedAt]);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, done: string) => {
    setBusy(key); setFlash(null);
    const r = await fn();
    setBusy(null);
    setFlash(r.ok ? (r.message ?? done) : (r.error ?? "Something went wrong."));
    router.refresh();
  };

  const openRemove = (r: (typeof rows)[number], preselect: string | null) => setRemoving({
    preselect,
    target: { id: r.p.id, name: r.p.name, stores: r.using.map((l) => ({ locationId: l.locationId, name: l.locationName, leaving: !!l.markedForRemoval })) },
  });

  const chip = (k: Filter, label: string) => (
    <button
      key={k}
      onClick={() => setFilter(k)}
      className={`px-3 py-1.5 rounded-full text-xs border ${filter === k ? "bg-[var(--brand-olive)] text-white border-[var(--brand-olive)]" : "bg-white border-[var(--line)] text-[var(--brand-brown)]"}`}
    >
      {label} <span className="opacity-70">{counts[k]}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-muted)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, vendor or category…"
            className="w-full pl-9 pr-3 py-2 bg-white border border-[var(--line)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 bg-white border border-[var(--line)] rounded-lg text-sm">
          <option value="ALL">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chip("all", "All")}
        {chip("inUse", "In use")}
        {chip("notInUse", "Not in use")}
        {chip("removedWeek", "Removed this week")}
        {chip("archived", "Archived")}
      </div>
      {flash && <p className="text-sm px-3 py-2 rounded-lg bg-[var(--brand-cream)] text-[var(--brand-brown)]">{flash}</p>}

      <div className="bg-white border border-[var(--line)] rounded-lg divide-y divide-[var(--line)]">
        {shown.length === 0 && <p className="px-4 py-6 text-sm text-[var(--ink-muted)] text-center">No products match.</p>}
        {shown.map((r) => {
          const { p } = r;
          const size = p.bottleSizeMl ? `${p.bottleSizeMl}${p.bottleSizeUnit === "ml" ? "ml" : ` ${p.bottleSizeUnit}`}` : null;
          return (
            <div key={p.id} className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--brand-brown)] truncate">
                  {p.name}
                  {size && <span className="ml-1.5 text-[11px] font-normal text-[var(--ink-muted)]">{size}</span>}
                  {r.archived && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">Archived</span>}
                </p>
                <p className="text-[11px] text-[var(--ink-muted)] truncate">
                  {[p.ingredientCategory, p.vendor].filter(Boolean).join(" · ") || "—"}
                  {r.using.length === 0 && r.lastRemoved && ` · last removed ${new Date(r.lastRemoved).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {locations.map((l) => {
                  const link = r.links.find((x) => x.locationId === l.id);
                  const inUse = link && !link.removedAt;
                  const leaving = inUse && !!link!.markedForRemoval;
                  const key = `${p.id}:${l.id}`;
                  if (r.archived) {
                    return <span key={l.id} className="px-2 py-1 rounded-full text-[11px] border border-[var(--line)] text-[var(--ink-muted)]">{short(l.name)} —</span>;
                  }
                  return inUse ? (
                    <button
                      key={l.id}
                      disabled={busy === key}
                      onClick={() => leaving
                        ? run(key, () => cancelRemoval({ productId: p.id, locationId: l.id }), `${p.name}: kept at ${short(l.name)}.`)
                        : openRemove(r, l.id)}
                      title={leaving ? `Leaving ${short(l.name)} when counted 0 — tap to keep it` : `In use at ${short(l.name)} — tap to remove`}
                      className={`px-2 py-1 rounded-full text-[11px] border ${leaving ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-[rgba(74,93,39,0.1)] border-[var(--brand-olive)] text-[var(--brand-olive-hover)]"}`}
                    >
                      {short(l.name)} {leaving ? "⏳" : "✓"}
                    </button>
                  ) : (
                    <button
                      key={l.id}
                      disabled={busy === key}
                      onClick={() => { if (confirm(`Add "${p.name}" to ${short(l.name)}?${link ? " Its earlier counts and areas come back." : ""}`)) run(key, () => addToStores({ productId: p.id, locationIds: [l.id] }), `${p.name}: added to ${short(l.name)}.`); }}
                      title={`Not used at ${short(l.name)} — tap to add`}
                      className="px-2 py-1 rounded-full text-[11px] border border-dashed border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--brand-olive)] hover:text-[var(--brand-olive)]"
                    >
                      {short(l.name)} +
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-1 sm:ml-2">
                {!r.archived && r.using.length > 0 && (
                  <button onClick={() => openRemove(r, null)} className="px-2 py-1 rounded-md text-[11px] border border-red-200 text-red-700 bg-red-50">Remove…</button>
                )}
                {r.archived ? (
                  <button disabled={busy === p.id} onClick={() => run(p.id, () => unarchiveProduct(p.id), `${p.name}: unarchived.`)} className="px-2 py-1 rounded-md text-[11px] border border-[var(--line)] bg-white">Unarchive</button>
                ) : (
                  <button
                    disabled={busy === p.id}
                    onClick={() => { if (confirm(`Archive "${p.name}"?${r.using.length ? ` It leaves ${r.using.map((l) => short(l.locationName)).join(", ")} now.` : ""} History is kept; find it under Archived.`)) run(p.id, () => archiveProduct(p.id), `${p.name}: archived.`); }}
                    className="px-2 py-1 rounded-md text-[11px] border border-[var(--line)] bg-white"
                  >
                    Archive
                  </button>
                )}
                {canPermanentDelete && (
                  <button
                    disabled={busy === p.id}
                    onClick={() => {
                      const where = r.using.length ? `\n\nStill used at: ${r.using.map((l) => short(l.locationName)).join(", ")}.` : "";
                      if (confirm(`Permanently delete "${p.name}"?${where}\n\nIt disappears from every list for good. Past orders and counts keep their lines.`)) {
                        run(p.id, () => permanentlyDelete(p.id), `${p.name}: deleted.`);
                      }
                    }}
                    className="px-2 py-1 rounded-md text-[11px] border border-red-300 text-white bg-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {removing && (
        <RemoveFromStoresDialog
          product={removing.target}
          preselect={removing.preselect}
          onClose={() => setRemoving(null)}
          onDone={(msg) => { setRemoving(null); setFlash(msg); router.refresh(); }}
        />
      )}
    </div>
  );
}

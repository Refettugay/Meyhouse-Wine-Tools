"use client";

// Order Cart drawer (2026-11-03, ORDER_CART_FLOW). One combined cart over the
// stores picked in its header; behind the scenes each store has its own cart
// (shared by everyone with ORDER access to it). Kiosk sends and desktop counts
// land here; lines are edited, moved between stores, and approved from here.

import { useMemo, useState } from "react";
import { ShoppingCart, Users } from "lucide-react";
import { cartMoveLine, cartRemoveLine, cartResolveRequest, cartSetQty, cartSetUnit } from "@/lib/actions/order-cart";
import { shortStore, sourceTag, type CartLineDTO, type CartRequestDTO, type CartViewer } from "@/lib/order-cart-types";

type Cart = { lines: CartLineDTO[]; requests: CartRequestDTO[] };
type ProductInfo = {
  id: string;
  casePackSize: number | null;
  bottleCostCents: number | null;
  inventory: { locationId: string; parLevel: number }[];
};

const unitLabel = (u: string) => (u === "case" ? "cs" : "btl");

export function OrderCartDrawer({
  open,
  onClose,
  cart,
  onCart,
  locations,
  orderStoreIds,
  cartStoreIds,
  onCartStoreIds,
  viewers,
  products,
  meId,
  onClearCart,
  approveSlot,
  approveMsg,
}: {
  open: boolean;
  onClose: () => void;
  cart: Cart;
  onCart: (c: Cart) => void;
  locations: { id: string; name: string }[];
  orderStoreIds: string[]; // stores this person may order for
  cartStoreIds: string[]; // stores the cart currently shows
  onCartStoreIds: (ids: string[]) => void;
  viewers: CartViewer[];
  products: ProductInfo[];
  meId: string;
  onClearCart: () => void;
  approveSlot?: React.ReactNode;
  approveMsg?: string | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const storeName = (id: string | null) => shortStore(locations.find((l) => l.id === id)?.name ?? "");
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const storeOrder = useMemo(() => locations.map((l) => l.id), [locations]);

  const lines = useMemo(() => cart.lines.filter((l) => cartStoreIds.includes(l.locationId)), [cart.lines, cartStoreIds]);
  const requests = useMemo(() => cart.requests.filter((r) => cartStoreIds.includes(r.locationId)), [cart.requests, cartStoreIds]);

  // vendor A→Z, then stores in the fixed store order, then item name
  const grouped = useMemo(() => {
    const byVendor = new Map<string, CartLineDTO[]>();
    for (const l of lines) {
      const v = l.vendor || "No Vendor";
      if (!byVendor.has(v)) byVendor.set(v, []);
      byVendor.get(v)!.push(l);
    }
    return [...byVendor.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([vendor, ls]) => {
        const byStore = new Map<string, CartLineDTO[]>();
        for (const l of ls) {
          if (!byStore.has(l.locationId)) byStore.set(l.locationId, []);
          byStore.get(l.locationId)!.push(l);
        }
        const stores = [...byStore.entries()]
          .sort(([a], [b]) => storeOrder.indexOf(a) - storeOrder.indexOf(b))
          .map(([locId, sl]) => [locId, sl.sort((a, b) => a.name.localeCompare(b.name))] as const);
        return { vendor, count: ls.length, stores };
      });
  }, [lines, storeOrder]);

  const total = lines.reduce((sum, l) => {
    const p = productById.get(l.ingredientId);
    if (!p?.bottleCostCents) return sum;
    const each = l.unit === "case" ? p.bottleCostCents * Math.max(1, p.casePackSize ?? 1) : p.bottleCostCents;
    return sum + (each * l.qty) / 100;
  }, 0);

  async function run(key: string, fn: () => Promise<{ error?: string; cart?: Cart } | undefined>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (res?.error) setError(res.error);
      if (res?.cart) onCart(res.cart);
    } catch {
      setError("Couldn't save — check the connection and try again.");
    }
    setBusy(null);
  }

  const viewerText = useMemo(() => {
    const byName = new Map<string, string[]>();
    for (const v of viewers) {
      if (!byName.has(v.name)) byName.set(v.name, []);
      byName.get(v.name)!.push(storeName(v.locationId));
    }
    return [...byName.entries()].map(([n, s]) => `${n} is also viewing ${s.join(", ")}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewers, locations]);

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden="true" />}
      <div
        className={`fixed top-0 right-0 h-screen w-[440px] max-w-[94vw] bg-white border-l border-[var(--line)] shadow-xl flex flex-col z-50 transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="Order Cart"
        aria-hidden={!open}
      >
        <div className="p-4 border-b border-[var(--line)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-[var(--brand-olive)]" />
              <h2 className="font-bold">Order Cart</h2>
              <span className="text-xs text-[var(--ink-muted)]">({lines.length})</span>
            </div>
            <button onClick={onClose} className="text-[var(--ink-muted)] hover:text-[var(--brand-brown)] text-lg" aria-label="Close cart">✕</button>
          </div>
          {/* Which stores this cart shows / approves */}
          {orderStoreIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1" aria-label="Stores in this cart">
              {storeOrder.filter((id) => orderStoreIds.includes(id)).map((id) => {
                const on = cartStoreIds.includes(id);
                const n = cart.lines.filter((l) => l.locationId === id).length;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      const next = on ? cartStoreIds.filter((x) => x !== id) : [...cartStoreIds, id];
                      onCartStoreIds(storeOrder.filter((x) => next.includes(x)));
                    }}
                    aria-pressed={on}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      on ? "bg-[var(--brand-olive)] border-[var(--brand-olive)] text-white" : "bg-white border-[var(--line)] text-[var(--ink-muted)]"
                    }`}
                  >
                    {storeName(id)}{n > 0 ? ` · ${n}` : ""}
                  </button>
                );
              })}
            </div>
          )}
          {viewerText.length > 0 && (
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-[#8A6A00] bg-[#FFF8E1] border border-[#F0D58A] rounded-lg px-2 py-1">
              <Users className="w-3.5 h-3.5 mt-px shrink-0" />
              <span>{viewerText.join(" · ")}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {error && <div className="mb-2 rounded-lg px-3 py-2 text-xs bg-red-50 border border-red-200 text-red-700">{error}</div>}

          {requests.length > 0 && (
            <div className="mb-3 space-y-1">
              {requests.map((r) => (
                <div key={r.id} className="rounded-lg border border-dashed border-[#D4A017] bg-[#FFF8E1] px-2 py-1.5 text-xs">
                  <div className="text-[10px] text-[#8A6A00]">Staff note · {storeName(r.locationId)} · {r.byName || "Staff"}</div>
                  <div className="text-[var(--brand-brown)]">{r.text}</div>
                  <div className="mt-1 flex gap-2">
                    <button disabled={!!busy} onClick={() => run(r.id, () => cartResolveRequest(r.id, "ADDED"))} className="text-[10px] font-medium text-[var(--brand-olive-hover)]">Done</button>
                    <button disabled={!!busy} onClick={() => run(r.id, () => cartResolveRequest(r.id, "DISMISSED"))} className="text-[10px] text-[var(--ink-muted)]">Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {cartStoreIds.length === 0 ? (
            <p className="text-center py-8 text-[var(--ink-muted)] text-sm">Pick a store above to see its cart.</p>
          ) : lines.length === 0 ? (
            <div className="text-center py-8 text-[var(--ink-muted)] text-sm">
              <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Cart is empty</p>
              <p className="text-xs mt-1">Kiosk counts and counts below par land here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map(({ vendor, count, stores }) => (
                <div key={vendor}>
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs font-bold text-[var(--brand-brown)] uppercase">{vendor}</span>
                    <span className="text-xs text-[var(--ink-muted)]">({count})</span>
                  </div>
                  {stores.map(([locId, storeLines]) => (
                    <div key={locId} className="mb-2">
                      {cartStoreIds.length > 1 && <p className="text-xs text-[var(--brand-olive-hover)] font-bold ml-1 mb-0.5">{storeName(locId)}</p>}
                      <div className="space-y-1">
                        {storeLines.map((l) => (
                          <CartLineRow
                            key={l.id}
                            line={l}
                            busy={busy === l.id}
                            disabled={!!busy}
                            tags={l.sources.map((s) => {
                              const t = sourceTag(s, storeName, meId);
                              return l.sources.length > 1 && s.kind !== "moved_in" ? `${t} (${s.qty}${unitLabel(l.unit)})` : t;
                            })}
                            neededBy={(() => {
                              const m = l.sources.find((s) => s.kind === "moved_in");
                              return m && m.fromLocationId !== l.locationId ? storeName(m.fromLocationId) : null;
                            })()}
                            par={productById.get(l.ingredientId)?.inventory.find((i) => i.locationId === l.locationId)?.parLevel ?? null}
                            storeOptions={storeOrder.filter((id) => orderStoreIds.includes(id)).map((id) => ({ id, name: storeName(id) }))}
                            onQty={(q) => run(l.id, () => cartSetQty(l.id, q))}
                            onUnit={(u) => run(l.id, () => cartSetUnit(l.id, u))}
                            onRemove={() => run(l.id, () => cartRemoveLine(l.id))}
                            onMove={(to) => run(l.id, () => cartMoveLine(l.id, to))}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <div className="p-4 border-t border-[var(--line)] bg-[var(--brand-cream)]">
            <div className="flex justify-between text-sm mb-3">
              <span className="text-[var(--ink-muted)]">Total: {lines.length} items</span>
              <span className="font-bold text-[var(--brand-olive-hover)]">{total > 0 ? `$${total.toFixed(2)}` : "—"}</span>
            </div>
            {approveMsg && <div className="mb-2 rounded-lg px-3 py-2 text-xs bg-red-50 border border-red-200 text-red-700">{approveMsg}</div>}
            <p className="text-[10px] text-[var(--ink-muted)] mb-2 text-center">
              Saved as you work · Approve sends {cartStoreIds.map(storeName).join(" + ")} to Approved orders.
            </p>
            <div className="flex gap-2">
              {approveSlot}
              <button onClick={() => window.print()} className="px-3 py-2 bg-[var(--brand-cream)] hover:bg-[var(--line)] rounded-lg text-xs transition-colors">Print</button>
            </div>
            <button
              onClick={() => {
                if (confirm(`Clear the cart for ${cartStoreIds.map(storeName).join(", ")}? Every line (kiosk and desktop) is removed.`)) onClearCart();
              }}
              className="w-full mt-2 py-2 bg-[var(--brand-cream)] hover:bg-red-50 hover:text-red-600 text-[var(--ink-muted)] rounded-lg text-xs transition-colors"
            >
              Clear All Items
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function CartLineRow({
  line, busy, disabled, tags, neededBy, par, storeOptions, onQty, onUnit, onRemove, onMove,
}: {
  line: CartLineDTO;
  busy: boolean;
  disabled: boolean;
  tags: string[];
  neededBy: string | null;
  par: number | null;
  storeOptions: { id: string; name: string }[];
  onQty: (q: number) => void;
  onUnit: (u: "case" | "bottle") => void;
  onRemove: () => void;
  onMove: (to: string) => void;
}) {
  // Qty is saved on Enter / leaving the box (not every keystroke).
  const [draft, setDraft] = useState(String(line.qty));
  const [editing, setEditing] = useState(false);
  // Follow the server's qty (another device / kiosk) unless I'm typing.
  const [seenQty, setSeenQty] = useState(line.qty);
  if (line.qty !== seenQty && !editing) {
    setSeenQty(line.qty);
    setDraft(String(line.qty));
  }
  const commit = () => {
    setEditing(false);
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0) { setDraft(String(line.qty)); return; }
    if (n !== line.qty) onQty(n);
  };

  return (
    <div className={`bg-[var(--brand-cream)] rounded px-2 py-1.5 text-xs ${busy ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0 mr-2">
          <p className="truncate font-medium">{line.name}</p>
          {neededBy && <p className="text-[10px] font-semibold text-[#8A6A00]">for {neededBy} · transfer</p>}
          {tags.map((t, i) => (
            <p key={i} className="text-[10px] text-[var(--ink-muted)] truncate">{t}</p>
          ))}
          {par !== null && <p className="text-[10px] text-[var(--ink-muted)]">Par {par}</p>}
        </div>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            value={draft}
            disabled={disabled}
            onFocus={() => setEditing(true)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            aria-label={`Quantity for ${line.name}`}
            className="w-10 px-0.5 py-0.5 border border-[var(--line)] rounded text-[11px] text-center font-bold focus:outline-none focus:ring-1 focus:ring-[var(--brand-olive)]"
          />
          <select
            value={line.unit}
            disabled={disabled}
            onChange={(e) => onUnit(e.target.value as "case" | "bottle")}
            className="px-0.5 py-0.5 border border-[var(--line)] rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-[var(--brand-olive)]"
            aria-label="Case or bottle"
          >
            <option value="bottle">btl</option>
            <option value="case">case</option>
          </select>
          <button onClick={onRemove} disabled={disabled} className="ml-0.5 text-[var(--ink-muted)] hover:text-red-500" title="Remove from cart" aria-label={`Remove ${line.name}`}>✕</button>
        </div>
      </div>
      {storeOptions.length > 1 && (
        <div className="mt-1 flex items-center gap-1">
          <span className="text-[9px] text-[var(--ink-muted)]">Store:</span>
          <select
            value={line.locationId}
            disabled={disabled}
            onChange={(e) => onMove(e.target.value)}
            className="text-[9px] px-1 py-0 border border-[var(--line)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--brand-olive)] bg-white"
            aria-label="Move to store"
          >
            {storeOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

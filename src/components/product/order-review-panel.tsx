"use client";

// Order tab → Review & approve, and Ready to email.
// One card per selected store; emails are only copied / opened in the mail app
// and marked as sent by hand — nothing is ever sent automatically.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Mail, Pause, Undo2, X } from "lucide-react";
import type { ReviewEmail, ReviewLine, ReviewOrder } from "@/lib/order-review-types";
import {
  reviewSetQty, reviewSetUnit, reviewRemoveLine, reviewMoveLine, reviewUndoMove, reviewAddItem,
  resolveStaffRequest, approveStoreOrders, markOrderEmailSent,
  reviewClearAll, reviewHoldOrder, reviewReleaseHeld, reviewUndoApprove,
} from "@/lib/actions/order-review";

type Loc = { id: string; name: string };
type AddableProduct = { id: string; name: string; locationIds: string[]; orderUnit: string | null; casePackSize: number | null };
type Result = { error?: string } | { success?: boolean; errors?: string[] } | undefined;

const GOLD = "text-[#8A6A00]";

function short(name: string) {
  return name.replace("Meyhouse ", "");
}
function when(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `Today ${time}`;
  if (d.toDateString() === new Date(today.getTime() - 86400000).toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ${time}`;
}

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r && "error" in r && r.error) setError(r.error);
      else if (r && "errors" in r && r.errors && r.errors.length > 0) setError(r.errors.join(" "));
      router.refresh();
      after?.();
    });
  return { pending, error, setError, run };
}

// ===========================================================================
// REVIEW & APPROVE
// ===========================================================================

export function ReviewPanel({
  orders, held, storeIds, locations, manageIds, products, onApproved,
}: {
  orders: ReviewOrder[];           // SUBMITTED orders
  held: ReviewOrder[];             // HELD orders ("Hold until next order")
  storeIds: string[];              // ticked in the store picker (in store order)
  locations: Loc[];
  manageIds: string[];             // stores this person may review/approve
  products: AddableProduct[];
  onApproved: () => void;
}) {
  const { pending, error, setError, run } = useAction();
  const openByStore = new Map(orders.map((o) => [o.locationId, o]));
  const approvable = storeIds.filter((id) => manageIds.includes(id) && openByStore.get(id)?.lines.some((l) => l.status !== "REJECTED"));

  if (storeIds.length === 0) {
    return <Empty text="Pick your stores in the store picker (top left)." />;
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-[var(--ink-muted)]">Check each store&rsquo;s order, fix anything, then approve. Approving never emails anyone.</p>
        {approvable.length > 1 && (
          <button
            disabled={pending}
            onClick={() => {
              if (!confirm(`Approve ${approvable.length} stores' orders?`)) return;
              run(() => approveStoreOrders(approvable.map((id) => openByStore.get(id)!.id)), onApproved);
            }}
            className="px-4 py-2 rounded-full bg-[var(--brand-olive)] text-white text-sm font-medium disabled:opacity-50"
          >
            Approve all ({approvable.length})
          </button>
        )}
      </div>
      {error && <ErrorBar text={error} onClose={() => setError(null)} />}
      <HeldList
        orders={held.filter((o) => storeIds.includes(o.locationId))}
        locations={locations}
        manageIds={manageIds}
        pending={pending}
        run={run}
      />
      {storeIds.map((id) => {
        const loc = locations.find((l) => l.id === id);
        if (!loc) return null;
        return (
          <StoreCard
            key={id}
            loc={loc}
            order={openByStore.get(id) ?? null}
            heldCount={held.filter((o) => o.locationId === id).length}
            canManage={manageIds.includes(id)}
            moveTargets={locations.filter((l) => l.id !== id && manageIds.includes(l.id))}
            locations={locations}
            products={products.filter((p) => p.locationIds.includes(id))}
            pending={pending}
            run={run}
            onApproved={onApproved}
          />
        );
      })}
    </div>
  );
}

// Orders on "Hold until next order" — they rejoin with the store's next count.
function HeldList({
  orders, locations, manageIds, pending, run,
}: {
  orders: ReviewOrder[];
  locations: Loc[];
  manageIds: string[];
  pending: boolean;
  run: (fn: () => Promise<Result>) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (orders.length === 0) return null;
  return (
    <div className="bg-[#FFFCF2] border border-dashed border-[#D4A017] rounded-xl overflow-hidden">
      <p className={`px-4 pt-3 pb-1 text-[11px] uppercase tracking-[0.14em] font-medium ${GOLD}`}>Held until next order ({orders.length})</p>
      <p className="px-4 pb-2 text-xs text-[var(--ink-muted)]">These come back on their own with the store&rsquo;s next count (a newer count replaces the held one for the same item).</p>
      <div className="divide-y divide-[#EFE3BF]">
        {orders.map((o) => {
          const loc = locations.find((l) => l.id === o.locationId);
          const lines = o.lines.filter((l) => l.status !== "REJECTED");
          const isOpen = openId === o.id;
          return (
            <div key={o.id} className="px-4 py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-[var(--brand-brown)]">{loc ? short(loc.name) : "Store"} <span className="font-normal text-[var(--ink-muted)]">· {lines.length} item{lines.length === 1 ? "" : "s"}</span></p>
                  <p className="text-[11px] text-[var(--ink-muted)]">Held by {o.heldByName || "—"}{o.heldAt ? ` · ${when(o.heldAt)}` : ""} · first sent by {o.sentByName || "—"}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setOpenId(isOpen ? null : o.id)} className="px-3 py-1.5 rounded-full border border-[var(--line)] bg-white text-xs font-medium">
                    {isOpen ? "Hide items" : "Show items"}
                  </button>
                  {manageIds.includes(o.locationId) && (
                    <button disabled={pending} onClick={() => run(() => reviewReleaseHeld(o.id))} className="px-3 py-1.5 rounded-full border border-[var(--brand-olive)] text-[var(--brand-olive)] bg-white text-xs font-medium disabled:opacity-50">
                      Bring back now
                    </button>
                  )}
                </div>
              </div>
              {isOpen && <ItemsList lines={lines} locations={locations} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Read-only list of an order's lines, grouped by vendor.
function ItemsList({ lines, locations }: { lines: ReviewLine[]; locations: Loc[] }) {
  const byVendor = new Map<string, ReviewLine[]>();
  for (const l of lines) {
    if (!byVendor.has(l.vendor)) byVendor.set(l.vendor, []);
    byVendor.get(l.vendor)!.push(l);
  }
  if (lines.length === 0) return <p className="mt-2 text-xs text-[var(--ink-muted)]">No items.</p>;
  return (
    <div className="mt-2 rounded-lg border border-[var(--line)] bg-white divide-y divide-[var(--line)]">
      {[...byVendor.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([vendor, ls]) => (
        <div key={vendor} className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.14em] font-medium text-[var(--ink-muted)] mb-1">{vendor} · {ls.length}</p>
          {[...ls].sort((a, b) => a.name.localeCompare(b.name)).map((l) => {
            const forStore = l.transferFromLocationId ? locations.find((x) => x.id === l.transferFromLocationId) : null;
            return (
              <div key={l.id} className="flex items-baseline justify-between gap-3 text-sm py-0.5">
                <span className="min-w-0">
                  {l.name}
                  {l.bottleSizeMl && <span className="text-[11px] text-[var(--ink-muted)]"> · {l.bottleSizeMl}ml</span>}
                  {forStore && <span className={`ml-1.5 text-[10px] font-semibold px-1 rounded bg-[#FFF8E1] border border-[#D4A017] ${GOLD}`}>FOR {short(forStore.name).toUpperCase()} · TRANSFER</span>}
                </span>
                <span className="font-semibold text-[var(--brand-olive)] whitespace-nowrap">
                  {l.qty} {l.unit === "case" ? (l.qty === 1 ? "case" : "cases") : "btl"}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function StoreCard({
  loc, order, heldCount, canManage, moveTargets, locations, products, pending, run, onApproved,
}: {
  loc: Loc;
  order: ReviewOrder | null;
  heldCount: number;
  canManage: boolean;
  moveTargets: Loc[];
  locations: Loc[];
  products: AddableProduct[];
  pending: boolean;
  run: (fn: () => Promise<Result>, after?: () => void) => void;
  onApproved: () => void;
}) {
  const [showRemoved, setShowRemoved] = useState(false);
  const active = useMemo(() => order?.lines.filter((l) => l.status !== "REJECTED") ?? [], [order]);
  const removed = order?.lines.filter((l) => l.status === "REJECTED") ?? [];
  const byVendor = useMemo(() => {
    const m = new Map<string, ReviewLine[]>();
    for (const l of active) {
      if (!m.has(l.vendor)) m.set(l.vendor, []);
      m.get(l.vendor)!.push(l);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([v, ls]) => [v, ls.sort((a, b) => a.name.localeCompare(b.name))] as const);
  }, [active]);

  return (
    <div className="bg-white border border-[var(--line)] rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-[var(--brand-cream)] border-b border-[var(--line)] flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-[var(--brand-brown)]">{short(loc.name)}</h3>
          <p className={`text-xs ${order ? "text-[var(--brand-olive)]" : "text-[var(--ink-muted)]"}`}>
            {order ? `Sent by ${order.sentByName || "—"} · ${when(order.sentAt)}` : "Nothing waiting"}
            {!order && heldCount > 0 && <span className={GOLD}> · held order joins the next count</span>}
          </p>
          {order && order.alsoCounted.length > 0 && (
            <p className="text-[11px] text-[var(--ink-muted)]">
              also counted by {order.alsoCounted.map((c) => `${c.name} at ${when(c.at)}`).join(", ")}
            </p>
          )}
          {!canManage && <p className="text-[11px] text-[var(--ink-muted)]">View only</p>}
        </div>
        {canManage && order && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {active.length > 0 && (
              <button
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Remove all ${active.length} item${active.length === 1 ? "" : "s"} from ${short(loc.name)}'s order?\n\nNothing is emailed. You can bring single items back from "Show removed".`)) return;
                  run(() => reviewClearAll(order.id));
                }}
                className="px-3 py-2 rounded-full border border-[var(--line)] bg-white text-sm font-medium text-red-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                <X className="w-4 h-4" /> Clear all
              </button>
            )}
            <button
              disabled={pending}
              onClick={() => run(() => reviewHoldOrder(order.id))}
              title="Not enough to order yet — keep this and add it to the next count"
              className="px-3 py-2 rounded-full border border-[#D4A017] bg-white text-sm font-medium text-[#8A6A00] disabled:opacity-50 flex items-center gap-1.5"
            >
              <Pause className="w-4 h-4" /> Hold until next order
            </button>
            {active.length > 0 && (
              <button
                disabled={pending}
                onClick={() => run(() => approveStoreOrders([order.id]), onApproved)}
                className="px-4 py-2 rounded-full bg-[var(--brand-olive)] text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Approve
              </button>
            )}
          </div>
        )}
      </div>

      {order && order.requests.length > 0 && (
        <div className="px-4 py-2 border-b border-[var(--line)] bg-[#FFF8E1] space-y-1">
          {order.requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
              <span className={GOLD}>
                <span className="font-medium">Request:</span> &ldquo;{r.text}&rdquo; — {r.byName || "staff"}
              </span>
              {canManage && (
                <span className="flex gap-1 shrink-0">
                  <button disabled={pending} onClick={() => run(() => resolveStaffRequest(r.id, "ADDED"))} className="px-2 py-0.5 rounded-full bg-white border border-[var(--line)]">Done</button>
                  <button disabled={pending} onClick={() => run(() => resolveStaffRequest(r.id, "DISMISSED"))} className="px-2 py-0.5 rounded-full bg-white border border-[var(--line)]">Dismiss</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {byVendor.length === 0 && order && (
        <p className="px-4 py-4 text-sm text-[var(--ink-muted)]">No lines left in this order.</p>
      )}
      {byVendor.map(([vendor, lines]) => (
        <div key={vendor} className="border-b border-[var(--line)] last:border-b-0">
          <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-[0.14em] font-medium text-[var(--ink-muted)]">
            {vendor} <span className="normal-case tracking-normal">· {lines.length} item{lines.length === 1 ? "" : "s"}</span>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {lines.map((l) => (
              <LineRow key={l.id} line={l} canManage={canManage} moveTargets={moveTargets} locations={locations} pending={pending} run={run} />
            ))}
          </div>
        </div>
      ))}

      {removed.length > 0 && (
        <div className="px-4 py-2 border-t border-[var(--line)]">
          <button onClick={() => setShowRemoved((v) => !v)} className="text-xs text-[var(--ink-muted)] underline">
            {showRemoved ? "Hide" : "Show"} removed ({removed.length})
          </button>
          {showRemoved && (
            <div className="mt-1 space-y-1">
              {removed.map((l) => (
                <div key={l.id} className="flex items-center justify-between text-xs">
                  <span className="line-through text-[var(--ink-muted)]">{l.name} · {l.qty} {l.unit}</span>
                  {canManage && (
                    <button disabled={pending} onClick={() => run(() => reviewRemoveLine(l.id, true))} className="flex items-center gap-1 text-[var(--brand-olive)]">
                      <Undo2 className="w-3 h-3" /> Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {canManage && <AddItem locationId={loc.id} products={products} pending={pending} run={run} />}
    </div>
  );
}

function LineRow({
  line, canManage, moveTargets, locations, pending, run,
}: {
  line: ReviewLine;
  canManage: boolean;
  moveTargets: Loc[];
  locations: Loc[];
  pending: boolean;
  run: (fn: () => Promise<Result>) => void;
}) {
  const [qty, setQty] = useState(String(line.qty));
  const [prevQty, setPrevQty] = useState(line.qty);
  if (line.qty !== prevQty) { setPrevQty(line.qty); setQty(String(line.qty)); } // server value changed
  const commitQty = () => {
    const n = parseFloat(qty);
    if (!Number.isFinite(n) || n === line.qty) { setQty(String(line.qty)); return; }
    run(() => reviewSetQty(line.id, n));
  };
  const isCase = line.unit === "case";
  const forStore = line.transferFromLocationId ? locations.find((l) => l.id === line.transferFromLocationId) : null;
  const size = line.bottleSizeMl ? ` · ${line.bottleSizeMl}ml` : "";
  const detail = [
    line.countedStock !== null ? `counted ${line.countedStock}${line.countedByName ? ` by ${line.countedByName}` : ""}` : line.source === "manager" ? "added by manager" : null,
    line.par !== null ? `par ${line.par}` : null,
    isCase && line.casePackSize && line.casePackSize > 1 ? `${line.casePackSize}/cs` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="px-4 py-2 flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[180px]">
        <p className="text-sm font-medium text-[var(--brand-brown)]">
          {line.name}<span className="text-[11px] font-normal text-[var(--ink-muted)]">{size}</span>
        </p>
        <p className="text-[11px] text-[var(--ink-muted)]">
          {detail}
          {line.unitIsStaffPick && <span className={`ml-1 px-1 rounded border border-dashed border-[#D4A017] bg-[#FFF8E1] ${GOLD}`}>staff pick</span>}
        </p>
        {forStore && (
          <p className="text-[10px] font-semibold tracking-wide mt-0.5">
            <span className={`px-1.5 py-0.5 rounded bg-[#FFF8E1] border border-[#D4A017] ${GOLD}`}>
              {line.transferNote || `FOR ${short(forStore.name).toUpperCase()} · TRANSFER`}
            </span>
            {line.movedByName && <span className="ml-1 font-normal text-[var(--ink-muted)]">moved by {line.movedByName}</span>}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min="0"
          step="1"
          inputMode="decimal"
          value={qty}
          disabled={!canManage || pending}
          onChange={(e) => setQty(e.target.value)}
          onBlur={commitQty}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="w-14 px-1 py-1 border border-[var(--line)] rounded text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] disabled:bg-[var(--brand-cream)]"
          aria-label="Quantity"
        />
        <div className="inline-flex rounded-lg border border-[var(--line)] overflow-hidden text-[11px] font-semibold" role="group" aria-label="Unit for this order">
          {(["case", "bottle"] as const).map((u) => (
            <button
              key={u}
              disabled={!canManage || pending || line.unit === u}
              onClick={() => run(() => reviewSetUnit(line.id, u))}
              className={`px-2 py-1 ${line.unit === u ? "bg-[var(--brand-olive)] text-white" : "bg-white text-[var(--brand-brown)] hover:bg-[var(--brand-cream)]"} disabled:cursor-default`}
            >
              {u === "case" ? "CS" : "BTL"}
            </button>
          ))}
        </div>
      </div>

      {canManage && (
        <div className="flex items-center gap-1.5">
          {forStore ? (
            <button disabled={pending} onClick={() => run(() => reviewUndoMove(line.id))} className="flex items-center gap-1 px-2 py-1 rounded-full border border-[var(--line)] text-xs">
              <Undo2 className="w-3 h-3" /> Undo move
            </button>
          ) : moveTargets.length > 0 && (
            <select
              value=""
              disabled={pending}
              onChange={(e) => { if (e.target.value) run(() => reviewMoveLine(line.id, e.target.value)); }}
              className="px-2 py-1 border border-[var(--line)] rounded-lg text-xs bg-white"
              aria-label="Move to another store"
            >
              <option value="">Move to…</option>
              {moveTargets.map((t) => <option key={t.id} value={t.id}>Move to {short(t.name)}</option>)}
            </select>
          )}
          <button disabled={pending} onClick={() => run(() => reviewRemoveLine(line.id))} className="p-1 text-[var(--ink-muted)] hover:text-red-600" aria-label="Remove line" title="Remove">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function AddItem({
  locationId, products, pending, run,
}: {
  locationId: string;
  products: AddableProduct[];
  pending: boolean;
  run: (fn: () => Promise<Result>, after?: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<AddableProduct | null>(null);
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState<"case" | "bottle">("bottle");
  const matches = q.trim() ? products.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];

  if (!open) {
    return (
      <div className="px-4 py-2 border-t border-[var(--line)]">
        <button onClick={() => setOpen(true)} className="text-sm text-[var(--brand-olive)] font-medium">+ Add item</button>
      </div>
    );
  }
  return (
    <div className="px-4 py-3 border-t border-[var(--line)] space-y-2 bg-[#FAF7F1]">
      {!pick ? (
        <>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search this store's products"
            className="w-full px-3 py-2 border border-[var(--line)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
          />
          {matches.map((p) => (
            <button
              key={p.id}
              onClick={() => { setPick(p); setUnit(p.orderUnit === "CASE" && (p.casePackSize ?? 0) > 1 ? "case" : "bottle"); }}
              className="block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-white"
            >
              {p.name}
            </button>
          ))}
        </>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium flex-1 min-w-[160px]">{pick.name}</span>
          <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className="w-16 px-1 py-1 border border-[var(--line)] rounded text-sm text-center bg-white" aria-label="Quantity" />
          <select value={unit} onChange={(e) => setUnit(e.target.value as "case" | "bottle")} className="px-2 py-1 border border-[var(--line)] rounded text-sm bg-white" aria-label="Unit">
            <option value="case">CS</option>
            <option value="bottle">BTL</option>
          </select>
          <button
            disabled={pending}
            onClick={() => run(() => reviewAddItem(locationId, pick.id, parseFloat(qty), unit), () => { setPick(null); setQ(""); setQty("1"); setOpen(false); })}
            className="px-3 py-1.5 rounded-full bg-[var(--brand-olive)] text-white text-sm font-medium disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
      <button onClick={() => { setOpen(false); setPick(null); setQ(""); }} className="text-xs text-[var(--ink-muted)] underline">Cancel</button>
    </div>
  );
}

// ===========================================================================
// APPROVED · READY TO EMAIL
// ===========================================================================

export function EmailsPanel({
  orders, storeIds, locations, manageIds,
}: {
  orders: ReviewOrder[];   // APPROVED + recently ORDERED
  storeIds: string[];
  locations: Loc[];
  manageIds: string[];
}) {
  const { pending, error, setError, run } = useAction();
  const shown = orders.filter((o) => storeIds.includes(o.locationId));
  const all = shown.flatMap((o) => o.emails);
  const toSend = all.filter((e) => e.status !== "SENT").length;

  if (shown.length === 0) return <Empty text="Nothing approved yet for the selected stores." />;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-[var(--brand-brown)]">Approved · ready to email</h3>
        <span className={`text-sm font-medium ${toSend > 0 ? GOLD : "text-[var(--brand-olive)]"}`}>
          {toSend > 0 ? `${toSend} of ${all.length} still to send` : `All ${all.length} sent`}
        </span>
      </div>
      <p className="text-xs text-[var(--ink-muted)]">Nothing is emailed automatically. Copy each email (or open it in your mail app), send it yourself, then mark it as sent.</p>
      {error && <ErrorBar text={error} onClose={() => setError(null)} />}
      {storeIds.map((id) => {
        const loc = locations.find((l) => l.id === id);
        const storeOrders = shown.filter((o) => o.locationId === id);
        if (!loc || storeOrders.length === 0) return null;
        return storeOrders.map((o) => (
          <div key={o.id} className="bg-white border border-[var(--line)] rounded-xl overflow-hidden">
            <ApprovedHeader
              order={o}
              storeName={short(loc.name)}
              locations={locations}
              canManage={manageIds.includes(id)}
              pending={pending}
              run={run}
            />
            <div className="divide-y divide-[var(--line)]">
              {o.emails.length === 0 && <p className="px-4 py-3 text-sm text-[var(--ink-muted)]">No emails (the order was empty).</p>}
              {o.emails.map((e) => (
                <EmailRow key={e.id} email={e} canManage={manageIds.includes(id)} pending={pending} run={run} />
              ))}
            </div>
          </div>
        ));
      })}
    </div>
  );
}

// Approved card header: "Show items" (what's about to be ordered) and
// "Undo approve" (back to Review & approve — only while nothing is marked sent).
function ApprovedHeader({
  order, storeName, locations, canManage, pending, run,
}: {
  order: ReviewOrder;
  storeName: string;
  locations: Loc[];
  canManage: boolean;
  pending: boolean;
  run: (fn: () => Promise<Result>) => void;
}) {
  const [show, setShow] = useState(false);
  const lines = order.lines.filter((l) => l.status !== "REJECTED");
  const anySent = order.emails.some((e) => e.status === "SENT");
  return (
    <div className="px-4 py-3 bg-[var(--brand-cream)] border-b border-[var(--line)]">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-semibold text-[var(--brand-brown)]">{storeName}</h3>
          <p className="text-xs text-[var(--ink-muted)]">
            Approved by {order.approvedByName || "—"} · {when(order.approvedAt)}
            {order.status === "ORDERED" && <span className="text-[var(--brand-olive)] font-medium"> · all emails sent</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setShow((v) => !v)} className="px-3 py-1.5 rounded-full border border-[var(--line)] bg-white text-xs font-medium">
            {show ? "Hide items" : `Show items (${lines.length})`}
          </button>
          {canManage && !anySent && (
            <button
              disabled={pending}
              onClick={() => {
                if (!confirm(`Send ${storeName}'s order back to Review & approve?\n\nIts emails are removed and made again when you approve.`)) return;
                run(() => reviewUndoApprove(order.id));
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-[var(--line)] bg-white text-xs font-medium"
            >
              <Undo2 className="w-3 h-3" /> Undo approve
            </button>
          )}
        </div>
      </div>
      {show && <ItemsList lines={lines} locations={locations} />}
    </div>
  );
}

function EmailRow({ email, canManage, pending, run }: { email: ReviewEmail; canManage: boolean; pending: boolean; run: (fn: () => Promise<Result>) => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const sent = email.status === "SENT";
  const copy = async (what: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1500); } catch {}
  };
  const full = `To: ${email.recipientEmail}\nSubject: ${email.subject}\n\n${email.body}`;
  const mailto = `mailto:${encodeURIComponent(email.recipientEmail).replace(/%2C%20/g, ",")}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;

  return (
    <div className={`px-4 py-3 ${sent ? "bg-[#F6F8F1]" : ""}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm text-[var(--brand-brown)]">{email.vendorName}</p>
          <p className="text-xs text-[var(--ink-muted)] break-words">
            To:{" "}
            {email.recipientEmail
              ? <>{email.recipientName ? `${email.recipientName} ` : ""}&lt;{email.recipientEmail}&gt;</>
              : <span className="text-red-600">No rep email for this store — add one in Vendors, or type the address yourself.</span>}
          </p>
          <p className="text-xs text-[var(--ink-muted)] break-words">Subject: {email.subject}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => copy("all", full)} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--brand-olive)] text-white text-xs font-medium">
            <Copy className="w-3 h-3" /> {copied === "all" ? "Copied" : "Copy email"}
          </button>
          <a href={mailto} className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-[var(--line)] text-xs font-medium">
            <Mail className="w-3 h-3" /> Open in mail app
          </a>
          {canManage && (sent ? (
            <button disabled={pending} onClick={() => run(() => markOrderEmailSent(email.id, false))} className="flex items-center gap-1 px-2 py-1.5 text-xs text-[var(--ink-muted)] underline">
              Undo
            </button>
          ) : (
            <button disabled={pending} onClick={() => run(() => markOrderEmailSent(email.id, true))} className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-[var(--brand-olive)] text-[var(--brand-olive)] text-xs font-medium">
              <Check className="w-3 h-3" /> Mark as sent
            </button>
          ))}
        </div>
      </div>
      {sent && (
        <p className="text-xs text-[var(--brand-olive)] mt-1">✓ Marked sent by {email.markedSentByName || "—"} · {when(email.markedSentAt)}</p>
      )}
      <div className="flex gap-3 mt-1">
        <button onClick={() => setOpen((v) => !v)} className="text-xs text-[var(--ink-muted)] underline">{open ? "Hide email" : "Show email"}</button>
        <button onClick={() => copy("to", email.recipientEmail)} className="text-xs text-[var(--ink-muted)] underline" disabled={!email.recipientEmail}>{copied === "to" ? "Copied" : "Copy To"}</button>
        <button onClick={() => copy("subject", email.subject)} className="text-xs text-[var(--ink-muted)] underline">{copied === "subject" ? "Copied" : "Copy subject"}</button>
      </div>
      {open && <pre className="mt-2 text-xs whitespace-pre-wrap font-mono bg-[var(--brand-cream)] rounded p-3">{email.body}</pre>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="bg-white border border-[var(--line)] rounded-xl p-8 text-center text-sm text-[var(--ink-muted)]">{text}</div>;
}
function ErrorBar({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 flex items-center justify-between">
      <span>{text}</span>
      <button onClick={onClose} aria-label="Dismiss">✕</button>
    </div>
  );
}

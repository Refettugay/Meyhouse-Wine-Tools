"use client";

// Approved orders + Order history tabs (2026-11-03, ORDER_CART_FLOW).
// Layout: one card per vendor (A→Z), inside one block per store (fixed store
// order), lines "2cs Isabey Sauvignon Blanc". Copy puts the plain text on the
// clipboard; Ordered writes the vendor's lines into the 8-week history.

import { useMemo, useState } from "react";
import { Check, Copy, RotateCcw, Eye, EyeOff } from "lucide-react";
import { clearApproved, markVendorOrdered, restoreApproved, undoVendorOrdered } from "@/lib/actions/approved-orders";
import {
  approvedLineText, groupApproved, shortStore, vendorCopyText,
  type ApprovedLineDTO, type ApprovedOrderDTO, type CartLineDTO, type CartRequestDTO,
} from "@/lib/order-cart-types";

type Approved = { active: ApprovedOrderDTO | null; history: ApprovedOrderDTO[] };
type Fresh = { approved?: Approved; cart?: { lines: CartLineDTO[]; requests: CartRequestDTO[] }; error?: string };
const STORE_TZ = "America/Los_Angeles";

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: STORE_TZ });
}
function timeOnly(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: STORE_TZ });
}

// Clipboard that also works on iPad/iPhone and on non-secure pages.
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function vendorState(lines: ApprovedLineDTO[]) {
  const ordered = lines.filter((l) => l.orderedEventId).length;
  return ordered === 0 ? "none" : ordered === lines.length ? "all" : "some";
}

function VendorCard({
  vendor, stores, events, storeName, readOnly, busy, onOrdered, onUndo,
}: {
  vendor: string;
  stores: { locationId: string; lines: ApprovedLineDTO[] }[];
  events: ApprovedOrderDTO["events"];
  storeName: (id: string) => string;
  readOnly: boolean;
  busy: boolean;
  onOrdered?: () => void;
  onUndo?: () => void;
}) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const all = stores.flatMap((s) => s.lines);
  const state = vendorState(all);
  const lastEvent = [...events].filter((e) => e.vendorName === vendor).sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))[0];
  const newCount = all.filter((l) => !l.orderedEventId).length;
  const green = state === "all";

  async function copy() {
    // Partly ordered: copy only the lines not ordered yet (the ones to email now).
    const src = !readOnly && state === "some"
      ? stores.map((s) => ({ ...s, lines: s.lines.filter((l) => !l.orderedEventId) })).filter((s) => s.lines.length > 0)
      : stores;
    const ok = await copyText(vendorCopyText({ vendor, stores: src }, storeName));
    setCopied(ok ? "ok" : "fail");
    setTimeout(() => setCopied(null), 1800);
  }

  return (
    <div
      className={`rounded-xl border p-3 ${
        green ? "bg-[#F1F5E8] border-[var(--brand-olive)]" : "bg-white border-[var(--line)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-[var(--brand-brown)] uppercase tracking-wide text-sm">{vendor}</div>
          {state === "all" && lastEvent && (
            <div className="text-[11px] text-[var(--brand-olive-hover)] font-medium flex items-center gap-1">
              <Check className="w-3 h-3" /> Ordered {timeOnly(lastEvent.orderedAt)} · added to history
            </div>
          )}
          {state === "some" && lastEvent && (
            <div className="text-[11px] text-[#8A6A00] font-medium">
              Ordered {timeOnly(lastEvent.orderedAt)} · {newCount} new line{newCount === 1 ? "" : "s"} not ordered yet
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={copy}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line)] bg-white text-xs font-medium text-[var(--brand-brown)] hover:bg-[var(--brand-cream)]"
            aria-label={`Copy ${vendor} order`}
          >
            {copied === "ok" ? <Check className="w-3.5 h-3.5 text-[var(--brand-olive)]" /> : <Copy className="w-3.5 h-3.5" />}
            {copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed" : "Copy"}
          </button>
          {!readOnly && state !== "all" && (
            <button
              onClick={onOrdered}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-lg bg-[var(--brand-olive)] text-white text-xs font-medium disabled:opacity-50"
            >
              {busy ? "Saving…" : state === "some" ? `Ordered (${newCount} new)` : "Ordered"}
            </button>
          )}
          {!readOnly && state !== "none" && (
            <button
              onClick={onUndo}
              disabled={busy}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line)] bg-white text-xs text-[var(--ink-muted)] disabled:opacity-50"
              title="Undo Ordered — removes these lines from the 8-week history"
            >
              <RotateCcw className="w-3 h-3" /> Undo
            </button>
          )}
          {readOnly && state === "all" && <span className="text-[11px] text-[var(--brand-olive-hover)] font-medium">Ordered</span>}
        </div>
      </div>
      <div className="mt-2">
        {stores.map((s, i) => (
          <div key={s.locationId} className={i > 0 ? "mt-2 pt-2 border-t border-dashed border-[var(--line)]" : ""}>
            <div className="text-xs font-bold text-[var(--brand-olive-hover)]">{storeName(s.locationId)}</div>
            <ul className="mt-0.5 space-y-0.5">
              {s.lines.map((l) => (
                <li key={l.id} className="text-sm text-[var(--brand-brown)] flex items-baseline gap-2">
                  <span>{approvedLineText(l)}</span>
                  {l.transferForLocationId && <span className="text-[10px] text-[#8A6A00]">for {storeName(l.transferForLocationId)}</span>}
                  {!readOnly && state === "some" && !l.orderedEventId && (
                    <span className="text-[10px] px-1 rounded bg-[#FFF8E1] text-[#8A6A00]">new</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function useStoreHelpers(locations: { id: string; name: string }[]) {
  const storeOrder = useMemo(() => locations.map((l) => l.id), [locations]);
  const storeName = (id: string) => shortStore(locations.find((l) => l.id === id)?.name ?? "");
  return { storeOrder, storeName };
}

export function ApprovedOrdersPanel({
  approved, locations, onFresh,
}: {
  approved: Approved;
  locations: { id: string; name: string }[];
  onFresh: (f: Fresh) => void;
}) {
  const { storeOrder, storeName } = useStoreHelpers(locations);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const a = approved.active;
  const groups = useMemo(() => (a ? groupApproved(a.lines, storeOrder) : []), [a, storeOrder]);

  async function run(key: string, fn: () => Promise<Fresh>) {
    setBusy(key);
    setError(null);
    try {
      const r = await fn();
      if (r.error) setError(r.error);
      onFresh(r);
    } catch {
      setError("Couldn't save — check the connection and try again.");
    }
    setBusy(null);
  }

  if (!a || a.lines.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-[var(--ink-muted)]">
        Nothing approved yet. Approve the Order Cart to see vendors here.
      </div>
    );
  }
  const done = groups.filter((g) => vendorState(g.lines) === "all").length;

  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="text-sm text-[var(--brand-brown)]">
          Approved by <span className="font-semibold">{a.approvedByName || "—"}</span> · {when(a.approvedAt)} ·{" "}
          <span className={done === groups.length ? "text-[var(--brand-olive-hover)] font-semibold" : "font-semibold"}>
            {done} of {groups.length} vendors ordered
          </span>
        </div>
        <button
          onClick={() => run("clear", () => clearApproved(a.id))}
          disabled={!!busy}
          className="px-3 py-1.5 rounded-lg border border-[var(--line)] bg-white text-xs font-medium text-[var(--brand-brown)] hover:bg-[var(--brand-cream)] disabled:opacity-50"
          title="Moves this list to Order history (you can restore it there)"
        >
          {busy === "clear" ? "Clearing…" : "Clear all"}
        </button>
      </div>
      {error && <div className="mb-2 rounded-lg px-3 py-2 text-xs bg-red-50 border border-red-200 text-red-700">{error}</div>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <VendorCard
            key={g.vendor}
            vendor={g.vendor}
            stores={g.stores}
            events={a.events}
            storeName={storeName}
            readOnly={false}
            busy={busy === g.vendor}
            onOrdered={() => run(g.vendor, () => markVendorOrdered(a.id, g.vendor))}
            onUndo={() => run(g.vendor, () => undoVendorOrdered(a.id, g.vendor))}
          />
        ))}
      </div>
    </div>
  );
}

export function OrderHistoryPanel({
  approved, locations, onFresh, onRestored,
}: {
  approved: Approved;
  locations: { id: string; name: string }[];
  onFresh: (f: Fresh) => void;
  onRestored: () => void;
}) {
  const { storeOrder, storeName } = useStoreHelpers(locations);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restore(id: string) {
    setBusy(id);
    setError(null);
    try {
      let r = await restoreApproved(id, false);
      if ("needsConfirm" in r && r.needsConfirm) {
        if (!confirm("Approved orders isn't empty.\n\nReplace it? The current list moves to Order history.")) { setBusy(null); return; }
        r = await restoreApproved(id, true);
      }
      const f = r as Fresh;
      if (f.error) setError(f.error);
      onFresh(f);
      if (!f.error) onRestored();
    } catch {
      setError("Couldn't restore — check the connection and try again.");
    }
    setBusy(null);
  }

  if (approved.history.length === 0) {
    return <div className="py-12 text-center text-sm text-[var(--ink-muted)]">No past orders yet. Clear all on Approved orders moves a list here (last 8 kept).</div>;
  }

  return (
    <div className="py-2 space-y-2">
      {error && <div className="rounded-lg px-3 py-2 text-xs bg-red-50 border border-red-200 text-red-700">{error}</div>}
      {approved.history.map((h) => {
        const groups = groupApproved(h.lines, storeOrder);
        const done = groups.filter((g) => vendorState(g.lines) === "all").length;
        const allDone = groups.length > 0 && done === groups.length;
        const stores = storeOrder.filter((id) => h.lines.some((l) => l.locationId === id)).map(storeName);
        const isOpen = open === h.id;
        return (
          <div key={h.id} className="rounded-xl border border-[var(--line)] bg-white">
            <div className="p-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap text-sm text-[var(--brand-brown)]">
                <span className="font-semibold">{when(h.firstApprovedAt)}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${allDone ? "bg-[#F1F5E8] text-[var(--brand-olive-hover)] border border-[var(--brand-olive)]" : "bg-[#FFF8E1] text-[#8A6A00] border border-[#F0D58A]"}`}>
                  {done} of {groups.length} ordered
                </span>
                <span className="text-xs text-[var(--ink-muted)]">
                  {stores.join(", ")} · {groups.length} vendor{groups.length === 1 ? "" : "s"} · {h.lines.length} item{h.lines.length === 1 ? "" : "s"}
                  {h.clearedAt ? ` · cleared ${when(h.clearedAt)}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setOpen(isOpen ? null : h.id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line)] text-xs font-medium text-[var(--brand-brown)] hover:bg-[var(--brand-cream)]">
                  {isOpen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} {isOpen ? "Hide" : "View"}
                </button>
                <button onClick={() => restore(h.id)} disabled={!!busy} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--brand-olive)] text-white text-xs font-medium disabled:opacity-50">
                  <RotateCcw className="w-3.5 h-3.5" /> {busy === h.id ? "Restoring…" : "Restore"}
                </button>
              </div>
            </div>
            {isOpen && (
              <div className="px-3 pb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {groups.map((g) => (
                  <VendorCard key={g.vendor} vendor={g.vendor} stores={g.stores} events={h.events} storeName={storeName} readOnly busy={false} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

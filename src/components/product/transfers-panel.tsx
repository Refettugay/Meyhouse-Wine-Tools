"use client";

// Transfers tab (owners/admins). Every line moved between stores with
// "Move to <store>" on Review & approve. List only — no inventory changes.
// Editing case size / unit cost also changes the product in Product Hub,
// after a warning; past rows keep the values they had.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Undo2 } from "lucide-react";
import type { TransferRow } from "@/lib/order-review-types";
import { markTransferred, setTransferValue } from "@/lib/actions/transfers";

type Loc = { id: string; name: string };
type Field = "casePackSize" | "unitCostCents";
type Pending = { row: TransferRow; field: Field; oldValue: number | null; newValue: number };

const STORE_TZ = "America/Los_Angeles";
const GOLD = "text-[#8A6A00]";

function short(name: string) {
  return name.replace("Meyhouse ", "");
}
function money(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function dayKey(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: STORE_TZ }) : "";
}
function dayLabel(key: string) {
  if (!key) return "No date";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function whenShort(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: STORE_TZ });
}
// Bottles moved and their value at cost (null = cost or case size missing).
function bottles(r: TransferRow): number | null {
  if (r.unit !== "case") return r.qty;
  return r.casePackSize ? r.qty * r.casePackSize : null;
}
function totalCents(r: TransferRow): number | null {
  const b = bottles(r);
  return b !== null && r.unitCostCents ? Math.round(b * r.unitCostCents) : null;
}
function statusLabel(r: TransferRow) {
  if (r.status === "TRANSFERRED") return "Transferred";
  if (r.orderStatus === "SUBMITTED" || r.orderStatus === "HELD") return "In review";
  return "Waiting";
}

export function TransfersPanel({ rows, locations }: { rows: TransferRow[]; locations: Loc[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmEdit, setConfirmEdit] = useState<Pending | null>(null);
  const [resetKey, setResetKey] = useState(0); // remounts inputs to restore old values on Cancel

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fromStore, setFromStore] = useState("ALL");
  const [toStore, setToStore] = useState("ALL");
  const [vendor, setVendor] = useState("ALL");
  const [status, setStatus] = useState<"ALL" | "WAITING" | "TRANSFERRED">("ALL");

  const storeName = (id: string) => short(locations.find((l) => l.id === id)?.name ?? "—");
  const vendors = useMemo(() => [...new Set(rows.map((r) => r.vendor))].sort(), [rows]);

  const shown = useMemo(() => rows.filter((r) => {
    const k = dayKey(r.movedAt);
    if (from && k < from) return false;
    if (to && k > to) return false;
    if (fromStore !== "ALL" && r.fromId !== fromStore) return false;
    if (toStore !== "ALL" && r.toId !== toStore) return false;
    if (vendor !== "ALL" && r.vendor !== vendor) return false;
    if (status === "WAITING" && r.status === "TRANSFERRED") return false;
    if (status === "TRANSFERRED" && r.status !== "TRANSFERRED") return false;
    return true;
  }), [rows, from, to, fromStore, toStore, vendor, status]);

  const summary = useMemo(() => {
    const dirs = new Map<string, { fromId: string; toId: string; items: number; cents: number }>();
    let waiting = 0, value = 0, missing = 0;
    for (const r of shown) {
      const key = `${r.fromId}>${r.toId}`;
      if (!dirs.has(key)) dirs.set(key, { fromId: r.fromId, toId: r.toId, items: 0, cents: 0 });
      const d = dirs.get(key)!;
      d.items += 1;
      const t = totalCents(r);
      if (t === null) missing += 1; else { d.cents += t; value += t; }
      if (r.status !== "TRANSFERRED") waiting += 1;
    }
    return { dirs: [...dirs.values()].sort((a, b) => b.items - a.items), waiting, value, missing };
  }, [shown]);

  const byDay = useMemo(() => {
    const m = new Map<string, TransferRow[]>();
    for (const r of shown) {
      const k = dayKey(r.movedAt);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return [...m.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [shown]);

  const run = (fn: () => Promise<{ error?: string } | { success: boolean }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if ("error" in r && r.error) setError(r.error);
      router.refresh();
    });

  // Called on blur / Enter of an editable cell: ask first, then save.
  const proposeEdit = (row: TransferRow, field: Field, raw: string) => {
    const oldValue = field === "casePackSize" ? row.casePackSize : row.unitCostCents;
    const parsed = parseFloat(raw.replace(/[$,]/g, ""));
    if (raw.trim() === "" || !Number.isFinite(parsed)) { setResetKey((k) => k + 1); return; }
    const newValue = field === "casePackSize" ? Math.round(parsed) : Math.round(parsed * 100);
    if (newValue === oldValue) return;
    setConfirmEdit({ row, field, oldValue, newValue });
  };

  const exportCsv = () => {
    const head = ["Date", "Product", "Size (ml)", "Vendor", "Qty", "Unit", "Case size", "Unit cost", "Total", "From", "To", "Moved by", "Status", "Transferred by", "Transferred at"];
    const cell = (v: string | number | null) => {
      const s = v === null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = shown.map((r) => {
      const t = totalCents(r);
      return [
        dayKey(r.movedAt), r.name, r.bottleSizeMl, r.vendor, r.qty, r.unit, r.casePackSize === -1 ? "By btl" : r.casePackSize,
        r.unitCostCents !== null ? (r.unitCostCents / 100).toFixed(2) : null, t !== null ? (t / 100).toFixed(2) : null,
        storeName(r.fromId), storeName(r.toId), r.movedByName, statusLabel(r), r.transferredByName, r.transferredAt ? whenShort(r.transferredAt) : null,
      ].map(cell).join(",");
    });
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `transfers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const sel = "px-3 py-2 bg-white border border-[var(--line)] rounded-lg text-sm text-[var(--brand-brown)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]";

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="bg-white border border-[var(--line)] rounded-xl p-3 flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-[var(--ink-muted)] flex flex-col gap-0.5">From date
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} />
        </label>
        <label className="text-[11px] text-[var(--ink-muted)] flex flex-col gap-0.5">To date
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} />
        </label>
        <label className="text-[11px] text-[var(--ink-muted)] flex flex-col gap-0.5">From store
          <select value={fromStore} onChange={(e) => setFromStore(e.target.value)} className={sel}>
            <option value="ALL">All stores</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{short(l.name)}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-[var(--ink-muted)] flex flex-col gap-0.5">To store
          <select value={toStore} onChange={(e) => setToStore(e.target.value)} className={sel}>
            <option value="ALL">All stores</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{short(l.name)}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-[var(--ink-muted)] flex flex-col gap-0.5">Vendor
          <select value={vendor} onChange={(e) => setVendor(e.target.value)} className={sel}>
            <option value="ALL">All vendors</option>
            {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-[var(--ink-muted)] flex flex-col gap-0.5">Status
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={sel}>
            <option value="ALL">All</option>
            <option value="WAITING">Waiting to transfer</option>
            <option value="TRANSFERRED">Transferred</option>
          </select>
        </label>
        <button onClick={exportCsv} disabled={shown.length === 0} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line)] bg-white text-sm font-medium disabled:opacity-40">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Card label="Waiting to be transferred" value={String(summary.waiting)} tone={summary.waiting > 0 ? "gold" : undefined} />
        <Card label="Value moved at cost" value={money(summary.value)} />
        <Card label="Missing a cost or case size" value={String(summary.missing)} tone={summary.missing > 0 ? "red" : undefined} />
        <Card label="Transfers shown" value={String(shown.length)} />
      </div>
      {summary.dirs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.dirs.map((d) => (
            <span key={`${d.fromId}>${d.toId}`} className="px-3 py-1.5 rounded-full bg-white border border-[var(--line)] text-xs text-[var(--brand-brown)]">
              <span className="font-medium">{storeName(d.fromId)} → {storeName(d.toId)}</span> · {d.items} item{d.items === 1 ? "" : "s"} · {money(d.cents)}
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white border border-[var(--line)] rounded-xl p-8 text-center text-sm text-[var(--ink-muted)]">
          No transfers yet. On Order → Review &amp; approve, use &ldquo;Move to…&rdquo; on a line to have another store order it.
        </div>
      ) : shown.length === 0 ? (
        <div className="bg-white border border-[var(--line)] rounded-xl p-8 text-center text-sm text-[var(--ink-muted)]">No transfers match these filters.</div>
      ) : (
        <div className="bg-white border border-[var(--line)] rounded-xl overflow-x-auto">
          <table key={resetKey} className="w-full min-w-[980px] text-sm">
            <thead className="bg-[var(--brand-cream)] text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Product</th>
                <th className="text-right px-2 py-2 font-medium">Qty</th>
                <th className="text-right px-2 py-2 font-medium">Case size</th>
                <th className="text-right px-2 py-2 font-medium">Unit cost</th>
                <th className="text-right px-2 py-2 font-medium">Total</th>
                <th className="text-left px-3 py-2 font-medium">From → To</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            {byDay.map(([day, list]) => (
              <tbody key={day} className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
                <tr className="bg-[#FAF7F1]">
                  <td colSpan={7} className="px-3 py-1.5 text-xs font-semibold text-[var(--brand-brown)]">{dayLabel(day)} <span className="font-normal text-[var(--ink-muted)]">· {list.length}</span></td>
                </tr>
                {list.map((r) => {
                  const t = totalCents(r);
                  return (
                    <tr key={r.id} className={r.status === "TRANSFERRED" ? "bg-[#F6F8F1]" : ""}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-[var(--brand-brown)]">{r.name}{r.bottleSizeMl && <span className="text-[11px] font-normal text-[var(--ink-muted)]"> · {r.bottleSizeMl}ml</span>}</p>
                        <p className="text-[11px] text-[var(--ink-muted)]">{r.vendor} · Moved by {r.movedByName || "—"}</p>
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap font-semibold">{r.qty} {r.unit === "case" ? "cs" : "btl"}</td>
                      <td className="px-2 py-2 text-right">
                        <EditCell
                          value={r.casePackSize === null || r.casePackSize === -1 ? "" : String(r.casePackSize)}
                          placeholder={r.casePackSize === -1 ? "By btl" : "—"}
                          disabled={busy}
                          onCommit={(v) => proposeEdit(r, "casePackSize", v)}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <EditCell
                          value={r.unitCostCents === null ? "" : (r.unitCostCents / 100).toFixed(2)}
                          placeholder="$—"
                          prefix="$"
                          disabled={busy}
                          onCommit={(v) => proposeEdit(r, "unitCostCents", v)}
                        />
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        {t !== null ? money(t) : <span className="text-red-600 text-xs">missing</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-medium">{storeName(r.fromId)}</span> → <span className="font-medium">{storeName(r.toId)}</span>
                      </td>
                      <td className="px-3 py-2">
                        {r.status === "TRANSFERRED" ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[var(--brand-olive)]">✓ {r.transferredByName || "—"} · {whenShort(r.transferredAt)}</span>
                            <button disabled={busy} onClick={() => run(() => markTransferred(r.id, false))} className="text-[var(--ink-muted)] hover:text-[var(--brand-brown)]" title="Undo" aria-label="Undo transferred">
                              <Undo2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className={`text-xs ${statusLabel(r) === "In review" ? "text-[var(--ink-muted)]" : GOLD}`}>{statusLabel(r)}</span>
                            <button
                              disabled={busy}
                              onClick={() => run(() => markTransferred(r.id, true))}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-[var(--brand-olive)] text-[var(--brand-olive)] text-xs font-medium disabled:opacity-50"
                            >
                              <Check className="w-3 h-3" /> Mark transferred
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {confirmEdit && (() => {
        const { row, field, oldValue, newValue } = confirmEdit;
        const fmt = (v: number | null) => (v === null ? "(empty)" : field === "unitCostCents" ? money(v) : `${v} per case`);
        const what = field === "unitCostCents" ? "unit cost" : "case size";
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/30" />
            <div className="relative w-full max-w-md bg-white rounded-xl shadow-lg p-5 space-y-3">
              <h3 className="font-semibold text-[var(--brand-brown)]">Warning</h3>
              <p className="text-sm text-[var(--brand-brown)]">
                You are changing the {what} of <span className="font-semibold">{row.name}</span> from <span className="font-semibold">{fmt(oldValue)}</span> to{" "}
                <span className="font-semibold">{fmt(newValue)}</span>. This will also change it in Product Hub.
              </p>
              <p className="text-xs text-[var(--ink-muted)]">Other past transfers keep the values they had.</p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => { setConfirmEdit(null); setResetKey((k) => k + 1); }}
                  className="px-4 py-2 rounded-full border border-[var(--line)] text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  disabled={busy}
                  onClick={() => { setConfirmEdit(null); run(() => setTransferValue(row.id, field, newValue)); }}
                  className="px-4 py-2 rounded-full bg-[var(--brand-olive)] text-white text-sm font-medium disabled:opacity-50"
                >
                  Yes, change it
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: "gold" | "red" }) {
  const color = tone === "gold" ? GOLD : tone === "red" ? "text-red-600" : "text-[var(--brand-brown)]";
  return (
    <div className="bg-white border border-[var(--line)] rounded-xl px-4 py-3">
      <p className="text-[11px] text-[var(--ink-muted)]">{label}</p>
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

// Inline number box: commits on blur / Enter (the panel asks before saving).
function EditCell({ value, placeholder, prefix, disabled, onCommit }: {
  value: string; placeholder: string; prefix?: string; disabled: boolean; onCommit: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) { setPrev(value); setV(value); } // server value changed
  return (
    <span className="inline-flex items-center gap-0.5">
      {prefix && <span className="text-[var(--ink-muted)] text-xs">{prefix}</span>}
      <input
        value={v}
        inputMode="decimal"
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== value) onCommit(v); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(value); (e.target as HTMLInputElement).blur(); } }}
        className="w-16 px-1.5 py-1 border border-[var(--line)] rounded text-right text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
      />
    </span>
  );
}

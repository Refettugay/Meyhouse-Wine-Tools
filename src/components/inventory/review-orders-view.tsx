"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, MapPin, Check, X, ArrowRightLeft, CheckCircle2, Undo2, Send } from "lucide-react";
import {
  approveOrder,
  sendBackOrder,
  setReviewItemQuantity,
  setReviewItemStatus,
  transferOrderItem,
} from "@/lib/actions/inventory";

interface ReviewItem {
  id: string;
  name: string;
  vendor: string;
  quantityNeeded: number;
  unit: string;
  countedStock: number | null;
  parSnapshot: number | null;
  status: string;
  transferNote: string | null;
  transferFromLocationId: string | null;
}

interface ReviewOrder {
  id: string;
  locationId: string;
  locationName: string;
  createdByName: string | null;
  submittedAt: string | null;
  reviewNote: string | null;
  items: ReviewItem[];
}

type FlatItem = ReviewItem & { orderId: string; locationName: string };

export function ReviewOrdersView({ orders }: { orders: ReviewOrder[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Local draft of quantity edits, keyed by item id.
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});

  async function run(key: string, fn: () => Promise<{ error?: string; success?: boolean } | void>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (res && "error" in res && res.error) setError(res.error);
      else router.refresh();
    } catch (e) {
      console.error(e);
      setError("Something went wrong. Please try again.");
    }
    setBusy(null);
  }

  // Merged-by-vendor view (requirement 4): all lines across every submitted
  // order, grouped by vendor, each annotated with its store so the reviewer can
  // move a line to another store to meet a vendor minimum.
  const byVendor = useMemo(() => {
    const flat: FlatItem[] = [];
    for (const o of orders) {
      for (const it of o.items) flat.push({ ...it, orderId: o.id, locationName: o.locationName });
    }
    const map = new Map<string, FlatItem[]>();
    for (const it of flat) {
      if (!map.has(it.vendor)) map.set(it.vendor, []);
      map.get(it.vendor)!.push(it);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([vendor, items]) => ({
        vendor,
        items: items.sort((a, b) => a.locationName.localeCompare(b.locationName) || a.name.localeCompare(b.name)),
      }));
  }, [orders]);

  const shortName = (n: string) => n.replace("Meyhouse ", "");

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Per-order action bar: approve / send back (requirement 3) */}
      <div className="space-y-2">
        {orders.map((o) => {
          const active = o.items.filter((i) => i.status !== "REJECTED").length;
          return (
            <div
              key={o.id}
              className="bg-white border border-[var(--line)] rounded-xl p-4 flex items-center justify-between flex-wrap gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[var(--brand-olive)]" />
                  <h3 className="font-semibold">{shortName(o.locationName)}</h3>
                  <span className="text-xs text-[var(--ink-muted)]">
                    {active} line{active === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                  Submitted by {o.createdByName || "—"}
                  {o.submittedAt ? ` · ${new Date(o.submittedAt).toLocaleString()}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const note = window.prompt(
                      "Send this order back to the manager. Add a note (optional):",
                      "",
                    );
                    if (note === null) return; // cancelled
                    run(`back:${o.id}`, () => sendBackOrder(o.id, note));
                  }}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[var(--brand-cream)] hover:bg-[var(--line)] rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Send Back
                </button>
                <button
                  onClick={() => run(`approve:${o.id}`, () => approveOrder(o.id))}
                  disabled={busy !== null || active === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {busy === `approve:${o.id}` ? "Approving..." : "Approve"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Merged by vendor — per-line edit / reject / transfer */}
      <div className="space-y-4">
        {byVendor.map(({ vendor, items }) => (
          <div key={vendor} className="bg-white border border-[var(--line)] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b-2 border-[var(--brand-olive)] bg-[#FAF7F1] flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-[var(--brand-olive)]" />
              <h2 className="text-lg font-bold">{vendor}</h2>
              <span className="text-xs text-[var(--ink-muted)]">
                ({items.length} line{items.length === 1 ? "" : "s"} across stores)
              </span>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {items.map((it) => {
                const rejected = it.status === "REJECTED";
                const transferTargets = orders.filter((o) => o.id !== it.orderId);
                const draft = qtyDraft[it.id] ?? String(it.quantityNeeded);
                return (
                  <div
                    key={it.id}
                    className={`px-4 py-3 flex items-center gap-3 flex-wrap ${rejected ? "opacity-50" : ""}`}
                  >
                    <div className="flex-1 min-w-[180px]">
                      <p className={`font-medium text-sm ${rejected ? "line-through" : ""}`}>{it.name}</p>
                      <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)] mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {shortName(it.locationName)}
                        </span>
                        {it.parSnapshot !== null && it.countedStock !== null && (
                          <>
                            <span>·</span>
                            <span>Par {it.parSnapshot} / Had {it.countedStock}</span>
                          </>
                        )}
                      </div>
                      {it.transferNote && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--brand-olive-hover)] bg-[rgba(74,93,39,0.12)] rounded px-2 py-0.5">
                          <ArrowRightLeft className="w-3 h-3" />
                          {it.transferNote}
                        </p>
                      )}
                    </div>

                    {/* Quantity edit */}
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={draft}
                        disabled={rejected || busy !== null}
                        onChange={(e) => setQtyDraft({ ...qtyDraft, [it.id]: e.target.value })}
                        onBlur={() => {
                          const v = parseFloat(draft);
                          if (!isNaN(v) && v !== it.quantityNeeded) {
                            run(`qty:${it.id}`, () => setReviewItemQuantity(it.id, v));
                          }
                        }}
                        className="w-16 px-2 py-1.5 border border-[var(--line)] rounded-lg text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] disabled:bg-[var(--brand-cream)]"
                      />
                      <span className="text-xs text-[var(--ink-muted)] w-8">{it.unit}</span>
                    </div>

                    {/* Transfer to another store's order (same vendor minimum) */}
                    {transferTargets.length > 0 && !rejected && (
                      <select
                        value=""
                        disabled={busy !== null}
                        onChange={(e) => {
                          if (e.target.value) run(`xfer:${it.id}`, () => transferOrderItem(it.id, e.target.value));
                        }}
                        className="px-2 py-1.5 border border-[var(--line)] rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                        title="Move this line to another store's order"
                      >
                        <option value="">Transfer to…</option>
                        {transferTargets.map((o) => (
                          <option key={o.id} value={o.id}>
                            → {shortName(o.locationName)}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Keep / reject */}
                    <button
                      onClick={() =>
                        run(`status:${it.id}`, () =>
                          setReviewItemStatus(it.id, rejected ? "PENDING" : "REJECTED"),
                        )
                      }
                      disabled={busy !== null}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                        rejected
                          ? "bg-[var(--brand-cream)] hover:bg-[var(--line)] text-[var(--brand-brown)]"
                          : "bg-red-50 hover:bg-red-100 text-red-600"
                      }`}
                      title={rejected ? "Restore this line" : "Reject this line"}
                    >
                      {rejected ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Keep
                        </>
                      ) : (
                        <>
                          <X className="w-3.5 h-3.5" /> Reject
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--ink-muted)] flex items-center gap-1.5">
        <Send className="w-3.5 h-3.5" />
        After approving, email vendors from the Order tab — vendors see only the combined
        quantity under the receiving store; transfers stay internal.
      </p>
    </div>
  );
}

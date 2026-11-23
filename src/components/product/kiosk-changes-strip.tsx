"use client";

// Admin → Beverage products: when a product row is picked, shows its kiosk
// notes (per store) and the latest kiosk changes (press-and-hold menu), with a
// link to the full "Recent kiosk changes" list. Behind KIOSK_ITEM_MENU.

import { useEffect, useState } from "react";
import Link from "next/link";
import { kioskChangesFor } from "@/lib/actions/kiosk-changes";
import { pacificTime, type KioskChange } from "@/lib/kiosk-changes-types";

export function KioskChangesStrip({
  productId, productName, notes, refreshKey,
}: {
  productId: string | null; // null = no row picked yet (strip stays, so the list doesn't jump)
  productName: string;
  notes: { store: string; note: string }[];
  refreshKey: string; // changes when the product's data reloads → fetch again
}) {
  const [rows, setRows] = useState<{ for: string; list: KioskChange[] } | null>(null);
  useEffect(() => {
    if (!productId) return;
    let stop = false;
    kioskChangesFor(productId).then((list) => { if (!stop) setRows({ for: productId, list }); }).catch(() => {});
    return () => { stop = true; };
  }, [productId, refreshKey]);
  const list = rows && rows.for === productId ? rows.list : null;

  return (
    // Fixed height: the strip is the same size for every item (and when none is
    // picked), so clicking rows never pushes the product list up or down.
    <div className="mt-2 h-[92px] flex flex-col rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <p className="font-medium text-[var(--brand-brown)] truncate">{productId ? `Kiosk · ${productName}` : "Kiosk"}</p>
        <Link href="/dashboard/kiosk-changes" className="shrink-0 text-[11px] text-[var(--brand-olive)] hover:underline">Recent kiosk changes →</Link>
      </div>
      <div className="mt-1 min-h-0 flex-1 overflow-y-auto">
        {notes.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1.5">
            {notes.map((n) => (
              <span key={n.store} className="px-1.5 py-0.5 rounded bg-[#FFF3C4] border border-[#E9CF6B] text-[11px] text-[#6B5200]">
                {n.store}: {n.note}
              </span>
            ))}
          </div>
        )}
        {!productId ? (
          <p className="text-[var(--ink-muted)]">Click an item to see its kiosk changes.</p>
        ) : list === null ? (
          <p className="text-[var(--ink-muted)]">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-[var(--ink-muted)]">No kiosk changes for this item yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {list.map((c) => <KioskChangeLine key={c.id} c={c} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

export function KioskChangeLine({ c, showItem = false }: { c: KioskChange; showItem?: boolean }) {
  return (
    <li className="flex flex-wrap gap-x-1.5 text-[11px] text-[var(--brand-brown)]">
      <span className="text-[var(--ink-muted)] tabular-nums">{pacificTime(c.at)}</span>
      <span className="text-[var(--ink-muted)]">· {c.store} ·</span>
      <span className="font-medium">{c.who}</span>
      {c.admin && <span className="px-1 rounded bg-[#F3EADB] text-[#A87E3B] text-[10px] font-medium uppercase tracking-wide">Admin</span>}
      {showItem && <span>· {c.item}</span>}
      <span>· {c.what}{c.from !== null || c.to !== null ? ":" : ""}</span>
      {(c.from !== null || c.to !== null) && (
        <span><span className="text-[var(--ink-muted)] line-through decoration-1">{c.from ?? "—"}</span> → <span className="font-medium">{c.to ?? "—"}</span></span>
      )}
    </li>
  );
}

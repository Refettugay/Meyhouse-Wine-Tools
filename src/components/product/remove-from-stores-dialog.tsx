"use client";

// "Remove from…" pop-up (Master Database, 2026-11-22). Always asks WHICH
// restaurants and WHEN. Never touches the other restaurants; the product stays
// in the Master Database.
import { useState } from "react";
import { removeFromStores } from "@/lib/actions/master-database";

export type RemoveTarget = {
  id: string;
  name: string;
  // Stores currently using it.
  stores: { locationId: string; name: string; leaving: boolean }[];
};

export function RemoveFromStoresDialog({
  product, preselect, onClose, onDone,
}: {
  product: RemoveTarget;
  preselect?: string | null; // a store id, or null = ask
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const only = product.stores.length === 1 ? product.stores[0].locationId : null;
  const start = preselect && product.stores.some((s) => s.locationId === preselect) ? preselect : only;
  const [scope, setScope] = useState<"one" | "pick" | "all">(start ? "one" : "pick");
  const [picked, setPicked] = useState<Set<string>>(new Set(start ? [start] : []));
  const [when, setWhen] = useState<"now" | "whenOut">("now");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = scope === "all" ? product.stores.map((s) => s.locationId)
    : scope === "one" && start ? [start] : [...picked];
  const names = product.stores.filter((s) => chosen.includes(s.locationId)).map((s) => s.name);
  const short = (n: string) => n.replace("Meyhouse ", "");

  const go = async () => {
    if (chosen.length === 0) { setError("Pick at least one restaurant."); return; }
    setBusy(true); setError(null);
    const r = await removeFromStores({ productId: product.id, locationIds: chosen, when });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onDone(r.message ?? `${product.name}: ${when === "now" ? "removed from" : "leaves when counted 0 at"} ${names.map(short).join(", ")}.`);
  };

  if (product.stores.length === 0) {
    return (
      <Shell onClose={onClose} title={product.name}>
        <p className="px-4 py-3 text-sm text-[var(--ink-muted)]">No restaurant uses this product right now. It&apos;s in the Master Database.</p>
        <div className="px-4 pb-4"><button onClick={onClose} className="w-full py-2 rounded-lg border border-[var(--line)] text-sm">Close</button></div>
      </Shell>
    );
  }

  const radio = "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer";
  const on = "border-[var(--brand-olive)] bg-[rgba(74,93,39,0.08)]";
  const off = "border-[var(--line)] bg-white";

  return (
    <Shell onClose={busy ? () => {} : onClose} title={`Remove "${product.name}"`}>
      <div className="px-4 py-3 space-y-4">
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">From which restaurant?</p>
          {start && (
            <label className={`${radio} ${scope === "one" ? on : off}`}>
              <input type="radio" checked={scope === "one"} onChange={() => setScope("one")} />
              Only {short(product.stores.find((s) => s.locationId === start)!.name)}
            </label>
          )}
          {product.stores.length > 1 && (
            <label className={`${radio} ${scope === "pick" ? on : off}`}>
              <input type="radio" checked={scope === "pick"} onChange={() => setScope("pick")} />
              Pick restaurants…
            </label>
          )}
          {scope === "pick" && (
            <div className="pl-7 space-y-1">
              {product.stores.map((s) => (
                <label key={s.locationId} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={picked.has(s.locationId)}
                    onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(s.locationId); else n.delete(s.locationId); return n; })}
                  />
                  {short(s.name)}{s.leaving && <span className="text-[10px] text-amber-700">(already leaving)</span>}
                </label>
              ))}
            </div>
          )}
          {product.stores.length > 1 && (
            <label className={`${radio} ${scope === "all" ? on : off}`}>
              <input type="radio" checked={scope === "all"} onChange={() => setScope("all")} />
              All restaurants ({product.stores.length})
            </label>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">When?</p>
          <label className={`${radio} ${when === "now" ? on : off}`}>
            <input type="radio" checked={when === "now"} onChange={() => setWhen("now")} />
            <span>Now <span className="text-[11px] text-[var(--ink-muted)]">— gone from Inventory, Count, Order and the Kiosk</span></span>
          </label>
          <label className={`${radio} ${when === "whenOut" ? on : off}`}>
            <input type="radio" checked={when === "whenOut"} onChange={() => setWhen("whenOut")} />
            <span>When it runs out <span className="text-[11px] text-[var(--ink-muted)]">— stays until a count of 0, never reordered</span></span>
          </label>
        </div>

        <p className="text-[11px] text-[var(--ink-muted)]">Other restaurants are not touched. It stays in the Master Database — you can add it back any time.</p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button disabled={busy} onClick={onClose} className="flex-1 py-2 rounded-lg border border-[var(--line)] bg-white text-sm">Cancel</button>
          <button disabled={busy || chosen.length === 0} onClick={go} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50">
            {busy ? "Working…" : chosen.length === 0 ? "Remove" : `Remove from ${chosen.length === 1 ? short(names[0] ?? "") : `${chosen.length} restaurants`}`}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-xl shadow-xl">
        <p className="px-4 pt-4 pb-2 text-sm font-semibold text-[var(--brand-brown)] border-b border-[var(--line)]">{title}</p>
        {children}
      </div>
    </div>
  );
}

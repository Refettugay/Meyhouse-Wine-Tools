"use client";

// Admin → Beverage products: ONE panel for Area 1 / Shelf 1 / Area 2 / Shelf 2.
// Tick up to 2 areas (first ticked = Area 1), type a shelf for each, Done saves
// all four at once. Used for a single row (anchored to the clicked cell) and
// for "Set location for selected (N)". Behind ADMIN_AREA_PICKER.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { AreaPick, LocationSet } from "@/lib/actions/area-picker";
import { ADMIN_SHELF_MAX } from "@/lib/admin-area-picker-flag";

// One line in the list. key = storage-area id, or "keep1"/"keep2" for an area
// that's on the item but no longer in this store's list.
export type PickerOption = { key: string; name: string; note?: string };
export type PickerTick = { key: string; shelf: string };

const GOLD = "#A87E3B";
const PANEL_W = 320;
const GAP = 8;

export function AreaShelfPicker({
  title, anchor, options, initial, onSave, onClose,
}: {
  title: string;
  anchor: HTMLElement;
  options: PickerOption[];
  initial: PickerTick[];
  onSave: (value: LocationSet) => Promise<string | null>; // → error message, or null when saved
  onClose: () => void;
}) {
  const [ticks, setTicks] = useState<PickerTick[]>(initial.slice(0, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const shelfRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const focusKey = useRef<string | null>(null);

  // Keep the panel next to the cell and fully on screen (also while the table
  // scrolls sideways / the window resizes).
  useLayoutEffect(() => {
    function place() {
      const panel = panelRef.current;
      if (!panel) return;
      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const w = Math.min(PANEL_W, vw - GAP * 2);
      const maxH = vh - GAP * 2;
      const h = Math.min(panel.scrollHeight, maxH);
      let left = r.left;
      if (left + w > vw - GAP) left = vw - GAP - w;
      if (left < GAP) left = GAP;
      let top = r.bottom + 4;
      if (top + h > vh - GAP) top = r.top - 4 - h; // flip above
      if (top < GAP) top = Math.max(GAP, vh - GAP - h); // still too tall → pin inside
      setPos((p) => (p && p.top === top && p.left === left && p.maxH === maxH ? p : { top, left, maxH }));
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    const ro = new ResizeObserver(place);
    if (panelRef.current) ro.observe(panelRef.current);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      ro.disconnect();
    };
  }, [anchor]);

  // Esc / click outside = close without saving.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }
    function onDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  // Cursor jumps into the Shelf box right after ticking.
  useEffect(() => {
    if (focusKey.current) {
      shelfRefs.current[focusKey.current]?.focus();
      focusKey.current = null;
    }
  }, [ticks]);

  const full = ticks.length >= 2;

  function toggle(key: string) {
    setError("");
    setTicks((t) => {
      if (t.some((x) => x.key === key)) return t.filter((x) => x.key !== key);
      if (t.length >= 2) return t;
      focusKey.current = key;
      return [...t, { key, shelf: "" }];
    });
  }

  function setShelf(key: string, shelf: string) {
    setTicks((t) => t.map((x) => (x.key === key ? { ...x, shelf } : x)));
  }

  async function done() {
    if (busy) return;
    const toPick = (t: PickerTick | undefined): AreaPick =>
      !t ? null : t.key === "keep1" ? { keep: 1 } : t.key === "keep2" ? { keep: 2 } : { areaId: t.key };
    const value: LocationSet = {
      area1: toPick(ticks[0]), shelf1: (ticks[0]?.shelf ?? "").trim(),
      area2: toPick(ticks[1]), shelf2: (ticks[1]?.shelf ?? "").trim(),
    };
    setBusy(true);
    setError("");
    try {
      const err = await onSave(value);
      if (err) setError(err);
      else onClose();
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Area and shelf · ${title}`}
      className="fixed z-[60] flex flex-col bg-[#FAF7F1] border border-[var(--line)] rounded-xl shadow-[0_8px_28px_rgba(0,0,0,0.18)] text-[var(--brand-brown)]"
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: `min(${PANEL_W}px, calc(100vw - ${GAP * 2}px))`,
        maxHeight: pos?.maxH,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <div className="flex items-start gap-2 px-3 pt-2.5 pb-1.5 border-b border-[var(--line)]">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" title={title}>{title}</p>
          <p className="text-[11px] text-[var(--ink-muted)]">
            {full ? "2 of 2 picked. Uncheck one to swap." : "Pick up to 2 areas. First one ticked is Area 1."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close without saving"
          className="shrink-0 -mr-1 w-10 h-10 flex items-center justify-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--line)]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <ul className="flex-1 min-h-0 overflow-y-auto py-1">
        {options.length === 0 && (
          <li className="px-3 py-3 text-xs text-[var(--ink-muted)]">This store has no areas yet. Add them in Settings → Storage areas.</li>
        )}
        {options.map((o) => {
          const idx = ticks.findIndex((t) => t.key === o.key);
          const on = idx >= 0;
          const disabled = !on && full;
          return (
            <li key={o.key} className={`flex items-center gap-2 px-3 min-h-[44px] ${on ? "bg-white" : ""}`}>
              <label className={`flex items-center gap-2 flex-1 min-w-0 min-h-[44px] ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={disabled || busy}
                  onChange={() => toggle(o.key)}
                  className="w-[18px] h-[18px] shrink-0 cursor-pointer disabled:cursor-not-allowed"
                  style={{ accentColor: GOLD }}
                />
                <span className="text-sm truncate">
                  {o.name}
                  {o.note && <span className="text-[var(--ink-muted)]"> {o.note}</span>}
                </span>
              </label>
              {on && (
                <>
                  <span
                    className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                    style={{ background: GOLD }}
                  >
                    Area {idx + 1}
                  </span>
                  <input
                    ref={(el) => { shelfRefs.current[o.key] = el; }}
                    value={ticks[idx].shelf}
                    onChange={(e) => setShelf(o.key, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void done(); } }}
                    maxLength={ADMIN_SHELF_MAX}
                    placeholder="Shelf"
                    aria-label={`Shelf for ${o.name}`}
                    disabled={busy}
                    className="shrink-0 w-[76px] h-9 px-2 bg-white border border-[var(--line)] rounded-md text-[16px] focus:outline-none focus:ring-2"
                    style={{ ["--tw-ring-color" as string]: GOLD }}
                  />
                </>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="mx-3 mb-1 px-2 py-1.5 rounded bg-red-50 border border-red-200 text-xs text-red-700">{error}</p>
      )}

      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-[var(--line)]">
        <button
          type="button"
          onClick={() => { setTicks([]); setError(""); }}
          disabled={busy || ticks.length === 0}
          className="min-h-[40px] px-3 rounded-lg text-sm text-[var(--ink-muted)] hover:bg-[var(--line)] disabled:opacity-40"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => void done()}
          disabled={busy}
          className="min-h-[40px] px-5 rounded-lg text-sm font-medium text-white disabled:opacity-60"
          style={{ background: GOLD }}
        >
          {busy ? "Saving…" : "Done"}
        </button>
      </div>
    </div>,
    document.body,
  );
}

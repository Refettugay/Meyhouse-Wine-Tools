"use client";

// Staff count page (phone-first, works on tablet). − / + move in 0.5-bottle
// steps; typing keeps the exact number (0.25, 0.1…). "−" on an uncounted item
// = 0 (out). Press and hold a row for the remove menu (same three choices as
// the admin Beverage tool). Counts are saved on the device as they go
// (survive lock/refresh) and cleared after a send.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listStaff, signIn, createPin, signOut, loadCountFeed, sendCounts, removeItem, updateItem, flagItem, countEntered } from "./actions";
import type { CountFeed, CountItem, FlagAction, ItemEdit, RemoveAction, StaffPerson } from "@/lib/staff-count/feed-types";
import { TYPE_CHIPS } from "@/lib/staff-count/types";
import { orderQty, type OrderUnit } from "@/lib/ordering-math";
import { KIOSK_ITEM_MENU, KIOSK_SWIPE_ACTIONS } from "@/lib/kiosk-flags";
import { searchMatcher } from "@/lib/search-normalize";

// Coming off menu: counted, never reordered.
const qtyFor = (i: CountItem, count: number, unit: OrderUnit | null) => (i.removing ? 0 : orderQty(i.par, count, unit, i.casePack));
const RED_ROW = "bg-[#FDEDEC]";
const NOTE_TAG = "max-w-full line-clamp-2 break-words w-fit mt-0.5 px-1.5 py-px rounded bg-[#FFF3C4] border border-[#E9CF6B] text-[10px] font-medium text-[#6B5200]";

type Stage = "loading" | "pick" | "pin" | "createPin" | "count" | "confirm" | "sent" | "error";
type Saved = { counts: Record<string, number>; picks: Record<string, OrderUnit>; request: string; savedAt: number };

const GOLD_BORDER = "border-[#D4A017]";

// Swipe actions (KIOSK_SWIPE_ACTIONS): amber "Check other areas", dark red 86.
const CHECK_ROW = "bg-[#FAEEDA]";
const CHECK_EDGE = "border-l-4 border-l-[#BA7517]";
const CHECK_TEXT = "text-[#633806]";
const GREY_ROW = "bg-[#ECECEC]";
const RED86_BG = "bg-[#A32D2D]";
const SWIPE_AT = 72;   // px a finger must travel to trigger the action
const SWIPE_MAX = 112; // px the row slides at most
const EDGE_PX = 20;    // a swipe starting this close to the left edge is ignored (iPhone Back)

type TagMode = "area" | "all"; // "area" = inside an Area tab (show the OTHER area); "all" = show both

function checkTag(i: CountItem, mode: TagMode): string {
  const loc = (a: string | null, sh: string | null) => (a ? `${a}${sh ? ` · Shelf ${sh}` : ""}` : null);
  const l1 = loc(i.areaName, i.shelf1);
  const l2 = loc(i.area2Name, i.shelf2);
  if (!l2) return "Check other areas"; // only one area
  if (mode === "area") return `Check other areas · ${l2}`;
  return `Check other areas · ${l1 ?? "Unassigned"} / ${l2}`;
}
const GOLD_TEXT = "text-[#8A6A00]";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}
function unitWord(unit: OrderUnit | null, qty: number, keg: boolean) {
  if (unit === "CASE") return qty === 1 ? "case" : "cases";
  if (keg) return qty === 1 ? "keg" : "kegs";
  return "btl";
}

export function StaffCountApp({ token, storeName }: { token: string; storeName: string }) {
  const [stage, setStage] = useState<Stage>("loading");
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<StaffPerson[]>([]);
  const [who, setWho] = useState<StaffPerson | null>(null);
  const [feed, setFeed] = useState<CountFeed | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentSummary, setSentSummary] = useState<{ lines: number; counted: number; cleared86: number } | null>(null);
  const [flagWarn, setFlagWarn] = useState(false);

  // ----- device-saved counts (per link + person) -----
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [picks, setPicks] = useState<Record<string, OrderUnit>>({});
  const [request, setRequest] = useState("");
  const storageKey = feed ? `staffCount:v1:${token}:${feed.me.name}` : null;
  const restoredFor = useRef<string | null>(null);

  // Bring back this person's unsent counts from the device (called once the
  // feed loads; later changes are saved by the effect below).
  const restoreSaved = useCallback((f: CountFeed) => {
    const key = `staffCount:v1:${token}:${f.me.name}`;
    if (restoredFor.current === key) return;
    restoredFor.current = key;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const s = JSON.parse(raw) as Saved;
      if (Date.now() - (s.savedAt || 0) > 24 * 3600_000) { localStorage.removeItem(key); return; }
      const valid = new Set(f.items.map((i) => i.id));
      setCounts(Object.fromEntries(Object.entries(s.counts || {}).filter(([k]) => valid.has(k))));
      setPicks(Object.fromEntries(Object.entries(s.picks || {}).filter(([k]) => valid.has(k))) as Record<string, OrderUnit>);
      setRequest(s.request || "");
    } catch {}
  }, [token]);

  useEffect(() => {
    if (!storageKey || restoredFor.current !== storageKey) return;
    try {
      const s: Saved = { counts, picks, request, savedAt: Date.now() };
      localStorage.setItem(storageKey, JSON.stringify(s));
    } catch {}
  }, [counts, picks, request, storageKey]);

  // ----- load -----
  const openCount = useCallback(async () => {
    const r = await loadCountFeed(token);
    if (r.ok) { restoreSaved(r.feed); setFeed(r.feed); setStage("count"); setError(null); return; }
    if (r.signedOut) { setStage("pick"); return; }
    setError(r.error); setStage("error");
  }, [token, restoreSaved]);

  useEffect(() => {
    (async () => {
      const r = await listStaff(token);
      if (!r.ok) { setError(r.error); setStage("error"); return; }
      setPeople(r.people);
      if (r.me) await openCount();
      else setStage("pick");
    })();
  }, [token, openCount]);

  // Kiosk item menu: keep this screen in step with Admin and other devices
  // (every 30s and when the screen comes back on). Typed counts are kept —
  // they're stored by item, so an item that moved area keeps its count.
  useEffect(() => {
    if (!KIOSK_ITEM_MENU || stage !== "count") return;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await loadCountFeed(token);
        if (stopped) return;
        if (r.ok) setFeed(r.feed);
        else if (r.signedOut) setStage("pick");
      } catch {}
    };
    const t = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => { stopped = true; clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [stage, token]);

  // Side panel save (par / area + shelf / note) → server → swap in the saved item.
  async function handleUpdate(item: CountItem, edit: ItemEdit): Promise<string | null> {
    const r = await updateItem(token, item.id, edit);
    if (!r.ok) {
      if (r.signedOut) setStage("pick");
      return r.error;
    }
    setFeed((f) => (f ? { ...f, items: f.items.map((i) => (i.id === item.id ? r.item : i)) } : f));
    return null;
  }

  // Swipe / menu flags → shown at once, then saved; put back if the save fails.
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  async function handleFlag(item: CountItem, action: FlagAction): Promise<string | null> {
    const before = { check: item.check, eightySix: item.eightySix };
    const now = { byName: feed?.me.name ?? "You", at: new Date().toISOString() };
    const optimistic =
      action === "check" ? { check: now } : action === "uncheck" ? { check: null }
        : action === "eighty_six" ? { eightySix: now } : { eightySix: null };
    const patch = (p: Partial<CountItem>) =>
      setFeed((f) => (f ? { ...f, items: f.items.map((i) => (i.id === item.id ? { ...i, ...p } : i)) } : f));
    patch(optimistic);
    try {
      const r = await flagItem(token, item.id, action);
      if (!r.ok) {
        patch(before);
        if (r.signedOut) setStage("pick");
        setToast(r.error);
        return r.error;
      }
      patch({ check: r.check, eightySix: r.eightySix });
      return null;
    } catch {
      patch(before);
      const msg = "Couldn't save. Check the connection and try again.";
      setToast(msg);
      return msg;
    }
  }

  // Entering a count (any number, 0 too) ends that item's "Check other areas" flag.
  function setCountFor(id: string, v: number | null) {
    setCounts((c) => {
      const next = { ...c };
      if (v === null) delete next[id]; else next[id] = v;
      return next;
    });
    if (!KIOSK_SWIPE_ACTIONS || v === null) return;
    const it = feed?.items.find((i) => i.id === id);
    if (!it?.check) return;
    setFeed((f) => (f ? { ...f, items: f.items.map((i) => (i.id === id ? { ...i, check: null } : i)) } : f));
    countEntered(token, id).catch(() => {});
  }

  // Press-and-hold menu → server, then update the list here (no reload).
  async function handleRemove(item: CountItem, action: RemoveAction): Promise<string | null> {
    const r = await removeItem(token, item.id, action);
    if (!r.ok) {
      if (r.signedOut) setStage("pick");
      return r.error;
    }
    setFeed((f) => {
      if (!f) return f;
      if (action === "delete") return { ...f, items: f.items.filter((i) => i.id !== item.id) };
      return {
        ...f,
        items: f.items.map((i) => i.id !== item.id ? i
          : action === "database" ? { ...i, offMenu: true }
          : { ...i, phasingOut: action === "mark", removing: KIOSK_ITEM_MENU && action === "mark" }),
      };
    });
    if (action === "delete") {
      setCounts((c) => { const n = { ...c }; delete n[item.id]; return n; });
      setPicks((p) => { const n = { ...p }; delete n[item.id]; return n; });
    }
    return null;
  }

  async function handleSignOut() {
    await signOut(token);
    setFeed(null); setWho(null); setCounts({}); setPicks({}); setRequest("");
    restoredFor.current = null;
    setStage("pick");
  }

  if (stage === "loading") return <Shell storeName={storeName}><p className="text-center text-sm text-[var(--ink-muted)] py-16">Loading…</p></Shell>;
  if (stage === "error") return <Shell storeName={storeName}><p className="text-center text-sm text-red-700 py-16 px-6">{error}</p></Shell>;

  if (stage === "pick") {
    return (
      <Shell storeName={storeName}>
        <PickName people={people} onPick={(p) => { setWho(p); setError(null); setStage(p.hasPin ? "pin" : "createPin"); }} />
      </Shell>
    );
  }

  if (stage === "pin" && who) {
    return (
      <Shell storeName={storeName}>
        <PinPad
          title={`Hi ${who.name.split(" ")[0]} — enter your PIN`}
          error={error}
          busy={busy}
          onBack={() => { setStage("pick"); setError(null); }}
          onComplete={async (pin) => {
            // "Checking" stays up until the list has loaded, not just the PIN check.
            setBusy(true);
            try {
              const r = await signIn(token, who.id, pin);
              if (r.ok) { setError(null); await openCount(); return; }
              if (r.needsPin) { setStage("createPin"); setError(null); return; }
              setError(r.error);
            } catch {
              setError("Couldn't check your PIN. Check the connection and try again.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </Shell>
    );
  }

  if (stage === "createPin" && who) {
    return (
      <Shell storeName={storeName}>
        <CreatePin
          name={who.name}
          busy={busy}
          error={error}
          onBack={() => { setStage("pick"); setError(null); }}
          onSave={async (pin) => {
            setBusy(true);
            try {
              const r = await createPin(token, who.id, pin);
              if (r.ok) { setError(null); await openCount(); return; }
              setError(r.error);
            } catch {
              setError("Couldn't save your PIN. Check the connection and try again.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </Shell>
    );
  }

  if (!feed) return null;

  const toOrder = feed.items
    .filter((i) => counts[i.id] !== undefined)
    .map((i) => {
      const unit = i.unit ?? picks[i.id] ?? null;
      return { item: i, unit, qty: qtyFor(i, counts[i.id], unit) };
    });
  const orderLines = toOrder.filter((l) => l.qty > 0);
  const openChecks = KIOSK_SWIPE_ACTIONS ? feed.items.filter((i) => i.check) : [];
  // Same rule as the server (count 0 sent → 86 clears); shown so nobody is surprised.
  const clears86 = KIOSK_SWIPE_ACTIONS ? toOrder.filter((l) => l.item.eightySix && counts[l.item.id] === 0) : [];

  if (stage === "confirm") {
    return (
      <Shell storeName={storeName} me={feed.me.name} onSignOut={handleSignOut}>
        <div className="px-4 py-4 space-y-4">
          <h2 className="text-lg font-medium text-[var(--brand-brown)]">Send to manager?</h2>
          <div className="bg-white border border-[var(--line)] rounded-xl divide-y divide-[var(--line)]">
            {orderLines.length === 0 ? (
              <p className="px-3 py-3 text-sm text-[var(--ink-muted)]">Nothing below par — your counts will still be sent.</p>
            ) : (
              orderLines.map((l) => (
                <div key={l.item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="truncate pr-2">
                    {l.item.name}
                    {l.item.size && <span className="ml-1 text-[11px] text-[var(--ink-muted)]">{l.item.size}</span>}
                  </span>
                  <span className="font-semibold text-[var(--brand-olive)] whitespace-nowrap">
                    {l.qty} {unitWord(l.unit, l.qty, l.item.keg)}
                    {l.unit === null && <span className={`ml-1 text-[10px] ${GOLD_TEXT}`}>(unit?)</span>}
                  </span>
                </div>
              ))
            )}
          </div>
          <p className="text-xs text-[var(--ink-muted)]">
            {toOrder.length} counted · {orderLines.length} to order · {toOrder.length - orderLines.length} at or above par
          </p>
          {clears86.length > 0 && (
            <p className="text-xs text-[#A32D2D]">
              86 clears when sent: {clears86.map((l) => l.item.name).join(", ")}
            </p>
          )}
          <label className="block">
            <span className="text-xs font-medium text-[var(--brand-brown)]">Something else? (optional)</span>
            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value.slice(0, 500))}
              rows={2}
              placeholder="e.g. we're out of cocktail napkins"
              className="mt-1 w-full px-3 py-2 border border-[var(--line)] rounded-lg text-base bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
            />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setStage("count"); setError(null); }} className="flex-1 py-3 rounded-full border border-[var(--line)] bg-white text-sm font-medium">Back</button>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await sendCounts(
                  token,
                  toOrder.map((l) => ({ id: l.item.id, count: counts[l.item.id], unitPick: l.item.unit === null ? picks[l.item.id] ?? null : null })),
                  request,
                );
                setBusy(false);
                if (r.ok) {
                  setCounts({}); setPicks({}); setRequest("");
                  try { if (storageKey) localStorage.removeItem(storageKey); } catch {}
                  setError(null);
                  setSentSummary({ lines: r.linesOrdered, counted: r.itemsCounted, cleared86: r.cleared86 ?? 0 });
                  setStage("sent");
                  return;
                }
                if (r.signedOut) { setStage("pick"); return; }
                setError(r.error);
              }}
              className="flex-[2] py-3 rounded-full bg-[var(--brand-olive)] text-white text-sm font-medium disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send to manager"}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (stage === "sent") {
    return (
      <Shell storeName={storeName}>
        <div className="px-6 py-16 text-center space-y-3">
          <div className="text-4xl">✓</div>
          <h2 className="text-lg font-medium text-[var(--brand-brown)]">Sent to your manager</h2>
          <p className="text-sm text-[var(--ink-muted)]">
            {sentSummary ? `${sentSummary.counted} counted · ${sentSummary.lines} to order${sentSummary.cleared86 ? ` · ${sentSummary.cleared86} 86 cleared` : ""}` : ""}
          </p>
          <p className="text-xs text-[var(--ink-muted)]">You&rsquo;ve been signed out.</p>
          <div className="flex flex-col gap-2 pt-4">
            <button onClick={handleSignOut} className="py-3 rounded-full bg-[var(--brand-olive)] text-white text-sm font-medium">Sign in to count again</button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell storeName={storeName} me={feed.me.name} onSignOut={handleSignOut}>
      <CountList
        feed={feed}
        counts={counts}
        picks={picks}
        setCount={setCountFor}
        setPick={(id, u) => setPicks((p) => ({ ...p, [id]: u }))}
        onRemove={handleRemove}
        onUpdate={handleUpdate}
        onFlag={handleFlag}
      />
      {toast && (
        <div className="fixed bottom-20 inset-x-4 z-30 mx-auto max-w-md rounded-lg bg-[var(--brand-brown)] text-white text-xs px-3 py-2 text-center shadow-lg" role="status">
          {toast}
        </div>
      )}
      {flagWarn && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" role="dialog" aria-modal="true" aria-label="Items still flagged">
          <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-4 pb-[max(env(safe-area-inset-bottom),16px)] space-y-3">
            <h2 className={`text-base font-medium ${CHECK_TEXT}`}>
              {openChecks.length} {openChecks.length === 1 ? "item" : "items"} still flagged to check other areas. Send anyway?
            </h2>
            <ul className={`max-h-56 overflow-y-auto rounded-lg border border-[#BA7517] ${CHECK_ROW} divide-y divide-[#E8D3B0]`}>
              {openChecks.map((i) => (
                <li key={i.id} className={`px-3 py-2 text-sm ${CHECK_TEXT}`}>
                  {i.name}
                  <span className="block text-[11px] opacity-80">{checkTag(i, "all")}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button onClick={() => setFlagWarn(false)} className="flex-1 py-3 rounded-full border border-[var(--line)] bg-white text-sm font-medium">Go back</button>
              <button
                onClick={() => { setFlagWarn(false); setError(null); setStage("confirm"); }}
                className="flex-1 py-3 rounded-full bg-[var(--brand-olive)] text-white text-sm font-medium"
              >
                Send anyway
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-[var(--line)] px-4 py-3 flex items-center gap-3">
        <span className="text-xs text-[var(--ink-muted)] flex-1">
          <span className="font-semibold text-[var(--brand-brown)]">{toOrder.length}</span> counted ·{" "}
          <span className="font-semibold text-[var(--brand-olive)]">{orderLines.length}</span> to order
        </span>
        <button
          disabled={toOrder.length === 0 && !request.trim()}
          onClick={() => {
            if (openChecks.length > 0) { setFlagWarn(true); return; }
            setError(null); setStage("confirm");
          }}
          className="px-5 py-3 rounded-full bg-[var(--brand-olive)] text-white text-sm font-medium disabled:opacity-40"
        >
          Send to manager
        </button>
      </div>
    </Shell>
  );
}

function Shell({ storeName, me, onSignOut, children }: { storeName: string; me?: string; onSignOut?: () => void; children: React.ReactNode }) {
  return (
    // The app's <body> is h-full + overflow-hidden (admin screens scroll inside
    // their own panels), so this page must be its own scroll container.
    <div className="h-full overflow-y-auto overflow-x-hidden overscroll-contain [overscroll-behavior-x:none] bg-[var(--brand-cream)] pb-24">
      <header className="sticky top-0 z-20 bg-[var(--brand-cream)] border-b border-[var(--line)] px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Count</p>
          <h1 className="text-base font-medium text-[var(--brand-brown)] leading-tight">{storeName}</h1>
        </div>
        {me && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--ink-muted)]">{me}</span>
            <button onClick={onSignOut} className="text-xs px-3 py-1.5 rounded-full border border-[var(--line)] bg-white">Sign out</button>
          </div>
        )}
      </header>
      <main className="max-w-2xl mx-auto">{children}</main>
    </div>
  );
}

function PickName({ people, onPick }: { people: StaffPerson[]; onPick: (p: StaffPerson) => void }) {
  const [q, setQ] = useState("");
  const shown = people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="px-4 py-4 space-y-3">
      <h2 className="text-lg font-medium text-[var(--brand-brown)]">Who&rsquo;s counting?</h2>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search your name"
        className="w-full px-3 py-2.5 border border-[var(--line)] rounded-lg text-base bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {shown.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            className="text-left px-3 py-3 rounded-xl bg-white border border-[var(--line)] text-sm font-medium text-[var(--brand-brown)] active:bg-[var(--line)]"
          >
            {p.name}
            {!p.hasPin && (
              <span className="block text-[10px] font-normal text-[var(--ink-muted)]">First time — create a PIN</span>
            )}
          </button>
        ))}
      </div>
      {people.length === 0 && <p className="text-sm text-[var(--ink-muted)]">No one is set up for ordering yet — ask your manager.</p>}
    </div>
  );
}

function PinPad({ title, error, busy, onBack, onComplete }: { title: string; error: string | null; busy: boolean; onBack: () => void; onComplete: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const press = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, 4);
    if (next.length === 4) { setPin(""); onComplete(next); return; }
    setPin(next);
  };
  // While a PIN is being checked the dots stay full (with the "Checking" pop-up);
  // when the check ends they're empty for the next try.
  const shown = busy ? 4 : pin.length;
  return (
    <div className="px-6 py-6 flex flex-col items-center gap-4">
      <h2 className="text-base font-medium text-[var(--brand-brown)] text-center">{title}</h2>
      <div className="flex gap-3" aria-label="PIN">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`w-4 h-4 rounded-full border-2 border-[var(--brand-olive)] ${shown > i ? "bg-[var(--brand-olive)]" : ""}`} />
        ))}
      </div>
      {error && <p className="text-sm text-red-700 text-center">{error}</p>}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} onClick={() => press(d)} className="h-16 rounded-2xl bg-white border border-[var(--line)] text-xl font-medium active:bg-[var(--line)]">{d}</button>
        ))}
        <button onClick={onBack} className="h-16 rounded-2xl text-sm text-[var(--ink-muted)]">Back</button>
        <button onClick={() => press("0")} className="h-16 rounded-2xl bg-white border border-[var(--line)] text-xl font-medium active:bg-[var(--line)]">0</button>
        <button onClick={() => setPin((p) => p.slice(0, -1))} className="h-16 rounded-2xl text-sm text-[var(--ink-muted)]">⌫</button>
      </div>
      {busy && <CheckingPopup />}
    </div>
  );
}

// Shown over the keypad while a PIN is being checked, so nobody thinks it
// didn't take and types it again.
function CheckingPopup() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25" role="status" aria-live="polite">
      <div className="mx-6 w-full max-w-[260px] rounded-2xl bg-white shadow-xl px-6 py-6 flex flex-col items-center gap-3">
        <span className="w-9 h-9 rounded-full border-4 border-[var(--line)] border-t-[var(--brand-olive)] animate-spin" aria-hidden="true" />
        <p className="text-base font-medium text-[var(--brand-brown)]">Checking your PIN…</p>
        <p className="text-xs text-[var(--ink-muted)]">One moment, no need to type it again.</p>
      </div>
    </div>
  );
}

function CreatePin({ name, busy, error, onBack, onSave }: { name: string; busy: boolean; error: string | null; onBack: () => void; onSave: (pin: string) => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <div key={round}>
      <p className="px-6 pt-4 text-center text-xs text-[var(--ink-muted)]">
        First time? Pick a 4-digit PIN. It&rsquo;s the same PIN you use for Tip Entry.
      </p>
      <PinPad
        title={first === null ? `${name.split(" ")[0]}, choose a PIN` : "Type it again to confirm"}
        error={mismatch ? "The two PINs didn't match. Start again." : error}
        busy={busy}
        onBack={() => { if (first !== null) { setFirst(null); setRound((r) => r + 1); } else onBack(); }}
        onComplete={(pin) => {
          if (first === null) { setFirst(pin); setMismatch(false); setRound((r) => r + 1); return; }
          if (pin !== first) { setFirst(null); setMismatch(true); setRound((r) => r + 1); return; }
          setMismatch(false);
          onSave(pin);
        }}
      />
    </div>
  );
}

function CountList({
  feed, counts, picks, setCount, setPick, onRemove, onUpdate, onFlag,
}: {
  feed: CountFeed;
  counts: Record<string, number>;
  picks: Record<string, OrderUnit>;
  setCount: (id: string, v: number | null) => void;
  setPick: (id: string, u: OrderUnit) => void;
  onRemove: (item: CountItem, action: RemoveAction) => Promise<string | null>;
  onUpdate: (item: CountItem, edit: ItemEdit) => Promise<string | null>;
  onFlag: (item: CountItem, action: FlagAction) => Promise<string | null>;
}) {
  // Item id (not a copy) so the open menu always shows the latest saved values.
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuFor = menuId ? feed.items.find((i) => i.id === menuId) ?? null : null;
  const setMenuFor = (i: CountItem | null) => setMenuId(i ? i.id : null);
  const [q, setQ] = useState("");
  const [groupBy, setGroupBy] = useState<"type" | "area">("area");
  const [chip, setChip] = useState<string>("ALL");
  const [offMenuOpen, setOffMenuOpen] = useState(false);
  // Flagged items pin to the top. One counted here stays in the pinned spot
  // (no longer amber) until the view changes, so it doesn't jump away mid-count.
  const [justChecked, setJustChecked] = useState<Set<string>>(() => new Set());
  const [checklist, setChecklist] = useState<string[] | null>(null); // ids, when open
  useEffect(() => { setJustChecked(new Set()); }, [q, groupBy, chip]);
  const countAndTrack = (i: CountItem, v: number | null) => {
    if (KIOSK_SWIPE_ACTIONS && v !== null && i.check) setJustChecked((s) => new Set(s).add(i.id));
    setCount(i.id, v);
  };
  const tagMode: TagMode = groupBy === "area" && chip !== "ALL" && !q.trim() ? "area" : "all";

  const areaKey = (i: CountItem) => i.areaId ?? "none";
  const areaName = (k: string) => (k === "none" ? "Unassigned" : feed.areas.find((a) => a.id === k)?.name ?? "Unassigned");

  const chips = useMemo(() => {
    if (groupBy === "type") return TYPE_CHIPS.filter((t) => feed.items.some((i) => i.type === t)).map((t) => ({ key: t, label: t }));
    const keys = [
      ...feed.areas.filter((a) => feed.items.some((i) => i.areaId === a.id)).map((a) => a.id),
      ...(feed.items.some((i) => !i.areaId) ? ["none"] : []),
    ];
    return keys.map((k) => ({ key: k, label: areaName(k) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, feed]);

  const isPinned = useCallback((i: CountItem) => KIOSK_SWIPE_ACTIONS && (!!i.check || justChecked.has(i.id)), [justChecked]);

  // Walking route: area (store order), then shelf (1, 2, 10…), then name.
  const routeSort = useCallback((a: CountItem, b: CountItem) => {
    const where = (i: CountItem) => (i.area2Id ? { id: i.area2Id, sh: i.shelf2 } : { id: i.areaId, sh: i.shelf1 });
    const ord = (id: string | null) => { const k = feed.areas.findIndex((x) => x.id === id); return k < 0 ? 9999 : k; };
    const wa = where(a), wb = where(b);
    return ord(wa.id) - ord(wb.id)
      || (wa.sh ?? "").localeCompare(wb.sh ?? "", undefined, { numeric: true })
      || a.name.localeCompare(b.name);
  }, [feed.areas]);

  // Flagged items for whatever tab / search is showing (off-menu ones too).
  const pinned = useMemo(() => {
    if (!KIOSK_SWIPE_ACTIONS) return [];
    const match = searchMatcher(q);
    const keyOf = (i: CountItem) => (groupBy === "type" ? i.type : areaKey(i));
    return feed.items
      .filter((i) => isPinned(i) && match(i.name) && (chip === "ALL" || keyOf(i) === chip))
      .sort(routeSort);
  }, [feed, q, groupBy, chip, isPinned, routeSort]);
  const pinnedOpen = pinned.filter((i) => i.check).length;

  const sections = useMemo(() => {
    const match = searchMatcher(q);
    const items = feed.items.filter((i) => !i.offMenu && !isPinned(i) && match(i.name));
    const keyOf = (i: CountItem) => (groupBy === "type" ? i.type : areaKey(i));
    return chips
      .filter((c) => chip === "ALL" || c.key === chip)
      .map((c) => ({ key: c.key, label: c.label, items: items.filter((i) => keyOf(i) === c.key) }))
      .filter((s) => s.items.length > 0);
  }, [feed, q, groupBy, chip, chips, isPinned]);

  // Active items that aren't On Menu — same search/chip filter, shown last and collapsed.
  const offMenuItems = useMemo(() => {
    const match = searchMatcher(q);
    const keyOf = (i: CountItem) => (groupBy === "type" ? i.type : areaKey(i));
    return feed.items.filter(
      (i) => i.offMenu && !isPinned(i) && match(i.name) && (chip === "ALL" || keyOf(i) === chip),
    );
  }, [feed, q, groupBy, chip, isPinned]);

  const countedByOther = (k: string) => {
    const c = feed.countedToday[k];
    return c && !c.byMe ? c : null;
  };
  const chipBanner = groupBy === "area" && chip !== "ALL" ? countedByOther(chip) : null;

  return (
    <div className="[overscroll-behavior-x:none]">
      <div className="sticky top-[57px] z-10 bg-[var(--brand-cream)] px-4 pt-3 pb-2 space-y-2 border-b border-[var(--line)]">
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="flex-1 min-w-0 px-3 py-1.5 border border-[var(--line)] rounded-lg text-base bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
          />
          <div className="inline-flex rounded-full border border-[var(--line)] bg-white p-0.5 text-xs font-medium" role="group" aria-label="Group by">
            {(["area", "type"] as const).map((g) => (
              <button
                key={g}
                onClick={() => { setGroupBy(g); setChip("ALL"); }}
                aria-pressed={groupBy === g}
                className={`px-3 py-1.5 rounded-full ${groupBy === g ? "bg-[var(--brand-olive)] text-white" : "text-[var(--brand-brown)]"}`}
              >
                {g === "area" ? "Area" : "Type"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1">
          {[{ key: "ALL", label: "All" }, ...chips].map((c) => (
            <button
              key={c.key}
              onClick={() => setChip(c.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${chip === c.key ? "bg-[var(--brand-olive)] text-white" : "bg-white border border-[var(--line)] text-[var(--brand-brown)]"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[var(--ink-muted)]">Count what&rsquo;s on the shelf — the order is worked out for you.</p>
        {chipBanner && (
          <p className={`text-xs px-3 py-2 rounded-lg bg-[#FFF8E1] border ${GOLD_BORDER} ${GOLD_TEXT}`}>
            {areaName(chip)} already counted by {chipBanner.byName} today at {fmtTime(chipBanner.at)}
          </p>
        )}
      </div>

      {pinned.length > 0 && (
        <section>
          <button
            onClick={() => setChecklist(pinned.filter((i) => i.check).map((i) => i.id))}
            disabled={pinnedOpen === 0}
            className={`w-full mt-2 px-4 py-2.5 flex items-center justify-between text-left ${CHECK_ROW} border-y border-[#BA7517] ${CHECK_TEXT}`}
          >
            <span className="text-sm font-semibold">Check other areas ({pinnedOpen})</span>
            {pinnedOpen > 0 && <span className="text-xs font-medium">Checklist ›</span>}
          </button>
          <div className="bg-white border-b border-[var(--line)] divide-y divide-[var(--line)]">
            {pinned.map((i) => (
              <CountRow
                key={i.id}
                item={i}
                sub={groupBy === "area" ? i.type : (i.areaName ?? "Unassigned")}
                count={counts[i.id]}
                pick={picks[i.id]}
                setCount={(v) => countAndTrack(i, v)}
                setPick={(u) => setPick(i.id, u)}
                onHold={() => setMenuFor(i)}
                tagMode={tagMode}
                canMark86={feed.me.canMark86}
                onFlag={(a) => onFlag(i, a)}
              />
            ))}
          </div>
        </section>
      )}
      {sections.length === 0 && offMenuItems.length === 0 && pinned.length === 0 && <p className="text-center text-sm text-[var(--ink-muted)] py-10">No items match.</p>}
      {sections.map((s) => {
        const other = groupBy === "area" ? countedByOther(s.key) : null;
        return (
          <section key={s.key}>
            {chip === "ALL" && (
              <div className="px-4 pt-4 pb-1 flex items-baseline justify-between gap-2">
                <h3 className="text-[11px] uppercase tracking-[0.14em] font-medium text-[var(--ink-muted)]">{s.label}</h3>
                {other && <span className={`text-[11px] ${GOLD_TEXT}`}>Counted by {other.byName} · {fmtTime(other.at)}</span>}
              </div>
            )}
            <div className="bg-white border-y border-[var(--line)] divide-y divide-[var(--line)]">
              {s.items.map((i) => (
                <CountRow
                  key={i.id}
                  item={i}
                  sub={groupBy === "area" ? i.type : (i.areaName ?? "Unassigned")}
                  count={counts[i.id]}
                  pick={picks[i.id]}
                  setCount={(v) => countAndTrack(i, v)}
                  setPick={(u) => setPick(i.id, u)}
                  onHold={() => setMenuFor(i)}
                  tagMode={tagMode}
                  canMark86={feed.me.canMark86}
                  onFlag={(a) => onFlag(i, a)}
                />
              ))}
            </div>
          </section>
        );
      })}
      {offMenuItems.length > 0 && (
        <section>
          <button
            onClick={() => setOffMenuOpen((o) => !o)}
            aria-expanded={offMenuOpen}
            className="w-full px-4 pt-5 pb-2 flex items-center justify-between text-left"
          >
            <span className="text-[11px] uppercase tracking-[0.14em] font-medium text-[var(--ink-muted)]">
              Off menu ({offMenuItems.length})
            </span>
            <span className="text-xs text-[var(--ink-muted)]">{offMenuOpen ? "Hide" : "Show"}</span>
          </button>
          {offMenuOpen && (
            <div className="bg-white border-y border-[var(--line)] divide-y divide-[var(--line)]">
              {offMenuItems.map((i) => (
                <CountRow
                  key={i.id}
                  item={i}
                  sub={groupBy === "area" ? i.type : (i.areaName ?? "Unassigned")}
                  count={counts[i.id]}
                  pick={picks[i.id]}
                  setCount={(v) => countAndTrack(i, v)}
                  setPick={(u) => setPick(i.id, u)}
                  onHold={() => setMenuFor(i)}
                  tagMode={tagMode}
                  canMark86={feed.me.canMark86}
                  onFlag={(a) => onFlag(i, a)}
                />
              ))}
            </div>
          )}
        </section>
      )}
      {checklist && (
        <Checklist
          items={checklist.map((id) => feed.items.find((i) => i.id === id)).filter((i): i is CountItem => !!i).sort(routeSort)}
          counts={counts}
          picks={picks}
          setCount={countAndTrack}
          setPick={setPick}
          onClose={() => setChecklist(null)}
        />
      )}
      {menuFor && (KIOSK_ITEM_MENU
        ? <ItemPanel item={menuFor} areas={feed.areas} canMarkRemove={feed.me.canMarkRemove} canMark86={feed.me.canMark86} onClose={() => setMenuFor(null)} onRemove={onRemove} onUpdate={onUpdate} onFlag={onFlag} />
        : <RemoveMenu item={menuFor} onClose={() => setMenuFor(null)} onRemove={onRemove} />)}
    </div>
  );
}

// Bottom sheet opened by press-and-hold — same wording as the admin Beverage tool.
// "Check other areas" checklist: just the flagged items, in walking order, each
// with its count box. An item counted here shows ✓ and its flag ends.
function Checklist({
  items, counts, picks, setCount, setPick, onClose,
}: {
  items: CountItem[];
  counts: Record<string, number>;
  picks: Record<string, OrderUnit>;
  setCount: (i: CountItem, v: number | null) => void;
  setPick: (id: string, u: OrderUnit) => void;
  onClose: () => void;
}) {
  const open = items.filter((i) => i.check).length;
  return (
    <div className="fixed inset-0 z-50 bg-[var(--brand-cream)] flex flex-col [overscroll-behavior-x:none]" role="dialog" aria-modal="true" aria-label="Check other areas">
      <div className={`px-4 pt-[max(env(safe-area-inset-top),14px)] pb-3 border-b border-[#BA7517] ${CHECK_ROW} flex items-center gap-2`}>
        <div className="flex-1 min-w-0">
          <p className={`text-base font-semibold ${CHECK_TEXT}`}>Check other areas ({open})</p>
          <p className={`text-[11px] ${CHECK_TEXT} opacity-80`}>In walking order: area, then shelf</p>
        </div>
        <button onClick={onClose} aria-label="Close" className={`px-3 py-1.5 rounded-full border border-[#BA7517] bg-white text-xs font-medium ${CHECK_TEXT}`}>Done</button>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        {items.length === 0 && <p className="text-center text-sm text-[var(--ink-muted)] py-10">Nothing left to check.</p>}
        <div className="bg-white border-b border-[var(--line)] divide-y divide-[var(--line)]">
          {items.map((i) => (
            <CountRow
              key={i.id}
              item={i}
              sub={[i.areaName ?? "Unassigned", i.shelf1 ? `Shelf ${i.shelf1}` : null].filter(Boolean).join(" · ")}
              count={counts[i.id]}
              pick={picks[i.id]}
              setCount={(v) => setCount(i, v)}
              setPick={(u) => setPick(i.id, u)}
              onHold={() => {}}
              tagMode="all"
              canMark86={false}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RemoveMenu({ item, onClose, onRemove }: { item: CountItem; onClose: () => void; onRemove: (item: CountItem, action: RemoveAction) => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: RemoveAction) => {
    if (action === "delete" && !confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return;
    setBusy(true); setError(null);
    const err = await onRemove(item, action);
    setBusy(false);
    if (err) setError(err); else onClose();
  };
  const opt = "w-full text-left px-4 py-3 active:bg-[var(--brand-cream)] disabled:opacity-50";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-md bg-white rounded-t-2xl shadow-lg pb-[max(env(safe-area-inset-bottom),12px)]">
        <p className="px-4 pt-4 pb-2 text-sm font-medium text-[var(--brand-brown)] border-b border-[var(--line)]">
          {item.name}
          {item.size && <span className="ml-1.5 text-[11px] font-normal text-[var(--ink-muted)]">{item.size}</span>}
        </p>
        <button disabled={busy} onClick={() => run(item.phasingOut ? "unmark" : "mark")} className={`${opt} border-b border-[var(--line)]`}>
          <p className="text-sm font-medium text-amber-700">{item.phasingOut ? "Cancel Phase-Out" : "Mark to Remove"}</p>
          <p className="text-[11px] text-[var(--ink-muted)]">{item.phasingOut ? "Stop phasing out (this store)" : "Keep until stock runs out (this store), then decide"}</p>
        </button>
        {!item.offMenu && (
          <button disabled={busy} onClick={() => run("database")} className={`${opt} border-b border-[var(--line)]`}>
            <p className="text-sm font-medium text-[var(--brand-brown)]">Move to Product Database</p>
            <p className="text-[11px] text-[var(--ink-muted)]">Tasted but not on menu yet</p>
          </button>
        )}
        <button disabled={busy} onClick={() => run("delete")} className={opt}>
          <p className="text-sm font-medium text-red-600">Permanently Delete</p>
          <p className="text-[11px] text-[var(--ink-muted)]">Removes from database — cannot be undone</p>
        </button>
        {error && <p className="px-4 pb-2 text-sm text-red-700">{error}</p>}
        <div className="px-4 pt-1">
          <button disabled={busy} onClick={onClose} className="w-full py-3 rounded-full border border-[var(--line)] bg-white text-sm font-medium">
            {busy ? "Working…" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Kiosk item menu (KIOSK_ITEM_MENU): side panel from the right, opened by
// press-and-hold. Mark/undo for managers, supervisors and owners (the server
// checks too); par, area + shelf and note for anyone; Database / Delete as
// before. Tap outside or ✕ to close.
type PanelView = "menu" | "par" | "loc" | "note";

function ItemPanel({
  item, areas, canMarkRemove, canMark86, onClose, onRemove, onUpdate, onFlag,
}: {
  item: CountItem;
  areas: { id: string; name: string }[];
  canMarkRemove: boolean;
  canMark86: boolean;
  onFlag: (item: CountItem, action: FlagAction) => Promise<string | null>;
  onClose: () => void;
  onRemove: (item: CountItem, action: RemoveAction) => Promise<string | null>;
  onUpdate: (item: CountItem, edit: ItemEdit) => Promise<string | null>;
}) {
  const [view, setView] = useState<PanelView>("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // The finger that opened the panel lifts over the backdrop — ignore that.
  const [openedAt] = useState(() => Date.now());
  const closeFromBackdrop = () => { if (!busy && Date.now() - openedAt > 400) onClose(); };

  const parUnit = item.keg ? "kegs" : "bottles";
  const [par, setPar] = useState<string>(String(item.par));
  const [area1, setArea1] = useState<string>(item.areaId ?? "");
  const [shelf1, setShelf1] = useState<string>(item.shelf1 ?? "");
  const [area2, setArea2] = useState<string>(item.area2Id ?? "");
  const [shelf2, setShelf2] = useState<string>(item.shelf2 ?? "");
  const [note, setNote] = useState<string>(item.note ?? "");

  const open = (v: PanelView) => {
    setError(null); setFlash(null);
    // Start each editor from the latest saved values.
    if (v === "par") setPar(String(item.par));
    if (v === "loc") { setArea1(item.areaId ?? ""); setShelf1(item.shelf1 ?? ""); setArea2(item.area2Id ?? ""); setShelf2(item.shelf2 ?? ""); }
    if (v === "note") setNote(item.note ?? "");
    setView(v);
  };

  const save = async (edit: ItemEdit, done: string) => {
    setBusy(true); setError(null);
    const err = await onUpdate(item, edit);
    setBusy(false);
    if (err) { setError(err); return; }
    setFlash(done); setView("menu");
  };
  const remove = async (action: RemoveAction) => {
    if (action === "delete" && !confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return;
    setBusy(true); setError(null);
    const err = await onRemove(item, action);
    setBusy(false);
    if (err) { setError(err); return; }
    if (action === "delete" || action === "database") onClose();
    else setFlash(action === "mark" ? "Marked to remove" : "Remove mark undone");
  };

  const flag = async (action: FlagAction, done: string) => {
    setBusy(true); setError(null);
    const err = await onFlag(item, action);
    setBusy(false);
    if (err) { setError(err); return; }
    setFlash(done);
  };

  const parNum = Number(par);
  const parOk = par.trim() !== "" && Number.isFinite(parNum) && parNum >= 0 && parNum <= 9999;
  const stepPar = (d: number) => setPar(String(Math.max(0, Math.round(((Number.isFinite(parNum) ? parNum : 0) + d) * 100) / 100)));

  const row = "w-full text-left px-4 py-3 border-b border-[var(--line)] active:bg-[var(--brand-cream)] disabled:opacity-50";
  const field = "w-full px-3 py-2 border border-[var(--line)] rounded-lg text-base bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]";
  const areaLabel = (id: string | null, shelf: string | null) =>
    id ? `${areas.find((a) => a.id === id)?.name ?? "—"}${shelf ? ` · Shelf ${shelf}` : ""}` : "—";

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={item.name}>
      <style>{"@keyframes kioskPanelIn{from{transform:translateX(100%)}to{transform:none}}"}</style>
      <div className="absolute inset-0 bg-black/30" onClick={closeFromBackdrop} />
      <div
        className="absolute inset-y-0 right-0 w-[min(100%,380px)] bg-white shadow-xl flex flex-col"
        style={{ animation: "kioskPanelIn .18s ease-out" }}
      >
        <div className="px-4 pt-[max(env(safe-area-inset-top),14px)] pb-3 border-b border-[var(--line)] flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-base font-medium text-[var(--brand-brown)] leading-snug break-words">
              {item.name}
              {item.size && <span className="ml-1.5 text-[11px] font-normal text-[var(--ink-muted)]">{item.size}</span>}
            </p>
            {item.removing && <p className="text-[11px] font-semibold text-red-700">Coming off menu · don&rsquo;t reorder</p>}
            {item.note && <p className="leading-none"><span className={NOTE_TAG}>{item.note}</span></p>}
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-9 h-9 -mr-1 rounded-full text-lg text-[var(--ink-muted)] active:bg-[var(--line)]">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {view === "menu" && (
            <div>
              {flash && <p className="mx-4 mt-3 px-3 py-2 rounded-lg bg-[#F1F5E8] border border-[var(--brand-olive)] text-xs text-[var(--brand-brown)]">✓ {flash}</p>}

              {KIOSK_SWIPE_ACTIONS && (
                <>
                  <button disabled={busy} onClick={() => flag(item.check ? "uncheck" : "check", item.check ? "Flag removed" : "Flagged: check other areas")} className={`${row} ${item.check ? "" : CHECK_ROW}`}>
                    <p className={`text-sm font-medium ${CHECK_TEXT}`}>{item.check ? "Remove flag" : "Check other areas"}</p>
                    <p className="text-[11px] text-[var(--ink-muted)]">
                      {item.check ? `Flagged by ${item.check.byName} · ${fmtTime(item.check.at)}` : "Pin it to the top until a count is entered (swipe right)"}
                    </p>
                  </button>
                  {canMark86 && (item.eightySix || !item.removing) ? (
                    <button disabled={busy} onClick={() => flag(item.eightySix ? "un_eighty_six" : "eighty_six", item.eightySix ? "86 cleared" : "Marked 86")} className={row}>
                      <p className="text-sm font-medium text-[#A32D2D]">{item.eightySix ? "Un-86" : "Mark 86"}</p>
                      <p className="text-[11px] text-[var(--ink-muted)]">
                        {item.eightySix ? `86 by ${item.eightySix.byName} · ${fmtTime(item.eightySix.at)}` : "Completely out. Shows in the Order Cart (swipe left)"}
                      </p>
                    </button>
                  ) : (
                    <div className={`${row} opacity-60 cursor-not-allowed`} aria-disabled="true">
                      <p className="text-sm font-medium text-[var(--ink-muted)]">🔒 {item.eightySix ? "Un-86" : "Mark 86"}</p>
                      <p className="text-[11px] text-[var(--ink-muted)]">{canMark86 ? "Coming off menu, so it can't be 86'd" : "Not allowed"}</p>
                    </div>
                  )}
                </>
              )}

              {canMarkRemove ? (
                <button disabled={busy} onClick={() => remove(item.removing ? "unmark" : "mark")} className={row}>
                  <p className={`text-sm font-medium ${item.removing ? "text-[var(--brand-brown)]" : "text-red-700"}`}>{item.removing ? "Undo remove mark" : "Mark to remove"}</p>
                  <p className="text-[11px] text-[var(--ink-muted)]">{item.removing ? "Back to normal — can be ordered again (this store)" : "Keep counting it, never reorder (this store)"}</p>
                </button>
              ) : (
                <div className={`${row} opacity-60 cursor-not-allowed`} aria-disabled="true">
                  <p className="text-sm font-medium text-[var(--ink-muted)]">🔒 {item.removing ? "Undo remove mark" : "Mark to remove"}</p>
                  <p className="text-[11px] text-[var(--ink-muted)]">Managers and supervisors only</p>
                </div>
              )}

              <button disabled={busy} onClick={() => open("par")} className={row}>
                <p className="text-sm font-medium text-[var(--brand-brown)]">Change par</p>
                <p className="text-[11px] text-[var(--ink-muted)]">Now {item.par} {parUnit} · this store</p>
              </button>
              <button disabled={busy} onClick={() => open("loc")} className={row}>
                <p className="text-sm font-medium text-[var(--brand-brown)]">Change location &amp; shelf</p>
                <p className="text-[11px] text-[var(--ink-muted)] truncate">1: {areaLabel(item.areaId, item.shelf1)}</p>
                <p className="text-[11px] text-[var(--ink-muted)] truncate">2: {areaLabel(item.area2Id, item.shelf2)}</p>
              </button>
              <button disabled={busy} onClick={() => open("note")} className={row}>
                <p className="text-sm font-medium text-[var(--brand-brown)]">{item.note ? "Edit note" : "Add a note"}</p>
                <p className="text-[11px] text-[var(--ink-muted)] truncate">{item.note ?? "Shows as a yellow tag for everyone"}</p>
              </button>

              <p className="px-4 pt-5 pb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">Remove from the list</p>
              {!item.offMenu && (
                <button disabled={busy} onClick={() => remove("database")} className={row}>
                  <p className="text-sm font-medium text-[var(--brand-brown)]">Move to Product Database</p>
                  <p className="text-[11px] text-[var(--ink-muted)]">Tasted but not on menu yet</p>
                </button>
              )}
              <button disabled={busy} onClick={() => remove("delete")} className={row}>
                <p className="text-sm font-medium text-red-600">Permanently Delete</p>
                <p className="text-[11px] text-[var(--ink-muted)]">Removes from database — cannot be undone</p>
              </button>
            </div>
          )}

          {view === "par" && (
            <div className="px-4 py-4 space-y-4">
              <p className="text-sm font-medium text-[var(--brand-brown)]">Par for this store</p>
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => stepPar(-1)} aria-label="Less" className="w-14 h-14 rounded-2xl border border-[var(--line)] bg-white text-2xl active:bg-[var(--line)]">−</button>
                <input
                  inputMode="decimal"
                  value={par}
                  onChange={(e) => setPar(e.target.value)}
                  aria-label="Par"
                  className="w-24 h-14 border border-[var(--line)] rounded-2xl text-center text-2xl font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
                />
                <button onClick={() => stepPar(1)} aria-label="More" className="w-14 h-14 rounded-2xl border border-[var(--line)] bg-white text-2xl active:bg-[var(--line)]">+</button>
              </div>
              <p className="text-center text-sm text-[var(--brand-brown)]"><span className="font-semibold">{parUnit}</span>{item.casePack ? <span className="text-[var(--ink-muted)]"> · {item.casePack} per case</span> : null}</p>
              <p className="text-center text-[11px] text-[var(--ink-muted)]">Same unit you count in. Was {item.par}. 0 is allowed.</p>
            </div>
          )}

          {view === "loc" && (
            <div className="px-4 py-4 space-y-4">
              {([
                { n: 1, area: area1, setArea: setArea1, shelf: shelf1, setShelf: setShelf1 },
                { n: 2, area: area2, setArea: setArea2, shelf: shelf2, setShelf: setShelf2 },
              ] as const).map((s) => (
                <div key={s.n} className="rounded-xl border border-[var(--line)] p-3 space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">Location {s.n}</p>
                  <div className="flex gap-2">
                    <label className="flex-[2] min-w-0">
                      <span className="block text-[11px] text-[var(--ink-muted)] mb-0.5">Area {s.n}</span>
                      <select value={s.area} onChange={(e) => s.setArea(e.target.value)} className={field}>
                        {s.n === 2 ? <option value="">—</option> : !s.area && <option value="">Pick an area</option>}
                        {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </label>
                    <label className="flex-1 min-w-0">
                      <span className="block text-[11px] text-[var(--ink-muted)] mb-0.5">Shelf {s.n}</span>
                      <input value={s.shelf} onChange={(e) => s.setShelf(e.target.value.slice(0, 20))} placeholder="—" className={field} />
                    </label>
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-[var(--ink-muted)]">The item moves to its Area 1 tab right away. A count you typed stays.</p>
            </div>
          )}

          {view === "note" && (
            <div className="px-4 py-4 space-y-2">
              <label className="block">
                <span className="text-sm font-medium text-[var(--brand-brown)]">Note</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 140))}
                  rows={3}
                  placeholder="e.g. back stock in the Liquor Room"
                  className={`mt-1 ${field}`}
                />
              </label>
              <p className="text-[11px] text-[var(--ink-muted)]">Shows as a yellow tag under the name for everyone, and in Admin. {140 - note.length} left.</p>
              {item.note && (
                <button disabled={busy} onClick={() => save({ note: "" }, "Note cleared")} className="text-xs text-red-700 underline">Clear note</button>
              )}
            </div>
          )}

          {error && <p className="px-4 py-2 text-sm text-red-700">{error}</p>}
        </div>

        {view !== "menu" && (
          <div className="px-4 pt-2 pb-[max(env(safe-area-inset-bottom),12px)] border-t border-[var(--line)] flex gap-2">
            <button disabled={busy} onClick={() => { setView("menu"); setError(null); }} className="flex-1 py-3 rounded-full border border-[var(--line)] bg-white text-sm font-medium">Back</button>
            <button
              disabled={busy || (view === "par" && !parOk) || (view === "loc" && !area1)}
              onClick={() => {
                if (view === "par") save({ par: parNum }, `Par set to ${Math.round(parNum * 100) / 100} ${parUnit}`);
                else if (view === "loc") save({ area1Id: area1, shelf1, area2Id: area2 || null, shelf2 }, "Location & shelf saved");
                else save({ note }, note.trim() ? "Note saved" : "Note cleared");
              }}
              className="flex-[2] py-3 rounded-full bg-[var(--brand-olive)] text-white text-sm font-medium disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Press and hold (~0.5s) anywhere on the row except its buttons / count box.
// Moving the finger (a scroll) cancels it. Right-click works on a computer.
function useHold(onHold: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; start.current = null; };
  const onControl = (t: EventTarget) => !!(t as HTMLElement).closest("button, input");
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (onControl(e.target)) return;
      cancel();
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        try { navigator.vibrate?.(15); } catch {}
        onHold();
      }, 500);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      if (onControl(e.target)) return;
      e.preventDefault();
      if (timer.current || e.button === 2) { cancel(); onHold(); }
    },
  };
}

// Sideways swipe on a row (KIOSK_SWIPE_ACTIONS). Only a clearly horizontal
// drag counts: a mostly-vertical one is left to the page scroll (touch-action
// pan-y), a tap never moves far enough, and drags that start on a button / the
// count box or within EDGE_PX of the left edge (iPhone Back) are ignored.
function useSwipe(o: { canRight: boolean; canLeft: boolean; onRight: () => void; onLeft: () => void }) {
  const st = useRef<{ x: number; y: number; id: number; mode: "?" | "h" | "v" } | null>(null);
  const dxRef = useRef(0);
  const [dx, setDx] = useState(0);
  const onControl = (t: EventTarget) => !!(t as HTMLElement).closest("button, input");
  const set = (v: number) => { dxRef.current = v; setDx(v); };
  const end = (fire: boolean) => {
    const s = st.current;
    st.current = null;
    const v = dxRef.current;
    set(0);
    if (!fire || !s || s.mode !== "h") return;
    if (v >= SWIPE_AT) o.onRight();
    else if (v <= -SWIPE_AT) o.onLeft();
  };
  return {
    dx,
    handlers: !KIOSK_SWIPE_ACTIONS ? {} : {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (onControl(e.target) || e.clientX < EDGE_PX) { st.current = null; return; }
        st.current = { x: e.clientX, y: e.clientY, id: e.pointerId, mode: "?" };
      },
      onPointerMove: (e: React.PointerEvent) => {
        const s = st.current;
        if (!s || s.id !== e.pointerId || s.mode === "v") return;
        const ddx = e.clientX - s.x, ddy = e.clientY - s.y;
        if (s.mode === "?") {
          if (Math.abs(ddy) > 10 && Math.abs(ddy) >= Math.abs(ddx)) { s.mode = "v"; return; }
          if (Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy) * 1.5) {
            s.mode = "h";
            try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch {}
          } else return;
        }
        let v = ddx;
        if (v > 0 && !o.canRight) v = 0;
        if (v < 0 && !o.canLeft) v = 0;
        set(Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, v)));
      },
      onPointerUp: () => end(true),
      onPointerCancel: () => end(false),
    },
  };
}

// Run both sets of pointer handlers (press-and-hold + swipe) on one element.
function mergeHandlers(a: Record<string, unknown>, b: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...a };
  for (const [k, fb] of Object.entries(b)) {
    const fa = a[k];
    out[k] = typeof fa === "function"
      ? (e: unknown) => { (fa as (e: unknown) => void)(e); (fb as (e: unknown) => void)(e); }
      : fb;
  }
  return out;
}

function CountRow({
  item, sub, count, pick, setCount, setPick, onHold, tagMode = "all", canMark86 = false, onFlag,
}: {
  item: CountItem;
  sub: string;
  count: number | undefined;
  pick: OrderUnit | undefined;
  setCount: (v: number | null) => void;
  setPick: (u: OrderUnit) => void;
  onHold: () => void;
  tagMode?: TagMode;
  canMark86?: boolean;
  onFlag?: (a: FlagAction) => void;
}) {
  const hold = useHold(onHold);
  // Swipe right = Check other areas / Remove flag; swipe left = Mark 86 / Un-86
  // (people with "Can mark 86" only; not for items coming off the menu).
  const can86 = !!onFlag && canMark86 && (!!item.eightySix || !item.removing);
  const swipe = useSwipe({
    canRight: !!onFlag,
    canLeft: can86,
    onRight: () => { try { navigator.vibrate?.(10); } catch {} onFlag?.(item.check ? "uncheck" : "check"); },
    onLeft: () => { try { navigator.vibrate?.(10); } catch {} onFlag?.(item.eightySix ? "un_eighty_six" : "eighty_six"); },
  });
  const handlers = mergeHandlers(hold as unknown as Record<string, unknown>, swipe.handlers as Record<string, unknown>);
  const dx = swipe.dx;
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const counted = count !== undefined;
  const unit = item.unit ?? pick ?? null;
  const short = counted ? item.par - (count as number) : null;
  const qty = counted ? qtyFor(item, count as number, unit) : 0;

  const step = (d: number) => {
    if (!counted) { setCount(d < 0 ? 0 : 0.5); return; } // "−" on uncounted = 0 (out)
    setCount(Math.max(0, Math.round(((count as number) + d) * 100) / 100)); // typed 0.25 → + → 0.75
  };
  const subParts = [sub, item.vendor, item.casePack ? `${item.casePack}/cs` : null].filter(Boolean);

  const flagged = KIOSK_SWIPE_ACTIONS && !!item.check;
  const out86 = KIOSK_SWIPE_ACTIONS && !!item.eightySix;
  const bg = out86 ? GREY_ROW : item.removing ? RED_ROW : flagged ? CHECK_ROW : counted ? "bg-[#FAF7F1]" : "bg-white";

  return (
    <div className="relative overflow-hidden">
      {dx > 0 && (
        <div className={`absolute inset-y-0 left-0 flex items-center px-3 ${CHECK_ROW} border-l-4 border-l-[#BA7517]`} style={{ width: Math.max(dx, 0) }} aria-hidden="true">
          <span className={`text-[11px] font-semibold leading-tight ${CHECK_TEXT} ${dx >= SWIPE_AT ? "" : "opacity-60"}`}>{item.check ? "Remove flag" : "Check other areas"}</span>
        </div>
      )}
      {dx < 0 && (
        <div className={`absolute inset-y-0 right-0 flex items-center justify-end px-3 ${RED86_BG}`} style={{ width: Math.max(-dx, 0) }} aria-hidden="true">
          <span className={`text-[11px] font-bold leading-tight text-white ${dx <= -SWIPE_AT ? "" : "opacity-70"}`}>{item.eightySix ? "Un-86" : "Mark 86"}</span>
        </div>
      )}
    <div
      {...handlers}
      style={dx ? { transform: `translateX(${dx}px)` } : { transition: "transform .15s ease-out" }}
      className={`relative px-3 py-2 flex items-center gap-2 select-none [-webkit-touch-callout:none] [-webkit-user-select:none] ${KIOSK_SWIPE_ACTIONS ? "[touch-action:pan-y]" : ""} ${bg} ${flagged ? CHECK_EDGE : ""}`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug line-clamp-2 break-words ${out86 ? "text-[var(--ink-muted)]" : "text-[var(--brand-brown)]"}`}>
          {out86 && <span className={`mr-1.5 inline px-1.5 py-px rounded ${RED86_BG} text-white text-[10px] font-bold align-[1px]`}>86</span>}
          {item.name}
          {item.size && <span className="ml-1.5 text-[11px] font-normal text-[var(--ink-muted)]">{item.size}</span>}
        </p>
        {out86 && (
          <p className="text-[10px] text-[#A32D2D] leading-snug">86 · {item.eightySix!.byName} · {fmtTime(item.eightySix!.at)}</p>
        )}
        {flagged && (
          <p className={`text-[11px] font-semibold leading-snug ${CHECK_TEXT}`}>
            {checkTag(item, tagMode)}
            <span className="font-normal opacity-80"> · {item.check!.byName} · {fmtTime(item.check!.at)}</span>
          </p>
        )}
        {item.removing && (
          <p className="text-[11px] font-semibold text-red-700 leading-snug">Coming off menu · don&rsquo;t reorder</p>
        )}
        {item.note && <p className="leading-none"><span className={NOTE_TAG}>{item.note}</span></p>}
        <p className="text-[11px] text-[var(--ink-muted)] truncate">
          {item.phasingOut && !KIOSK_ITEM_MENU && <span className="mr-1 text-amber-700 font-medium">Phasing out ·</span>}
          {subParts.join(" · ")}
        </p>
        {short !== null && item.removing && (
          <p className="text-[11px] truncate text-[var(--ink-muted)]">Counted · not reordered</p>
        )}
        {short !== null && !item.removing && (
          <p className="text-[11px] truncate">
            {short > 0
              ? <span className="text-[var(--brand-olive)] font-medium">Short {short} → {qty} {unitWord(unit, qty, item.keg)}</span>
              : <span className="text-green-700">OK — at or above par</span>}
          </p>
        )}
      </div>

      {/* Par — beside CS/BTL, the same size as the two unit buttons together. */}
      <div
        className={`w-11 h-12 shrink-0 rounded border flex flex-col items-center justify-center bg-white ${item.par > 0 ? "border-[var(--line)]" : GOLD_BORDER}`}
        aria-label={`Par ${item.par}`}
        title={item.par > 0 ? undefined : "No par set"}
      >
        <span className="text-[9px] tracking-[0.08em] text-[var(--ink-muted)] leading-none">PAR</span>
        <span className={`text-lg font-semibold leading-tight ${item.par > 0 ? "text-[var(--brand-brown)]" : GOLD_TEXT}`}>{item.par}</span>
      </div>

      {/* CS/BTL: display-only when the admin set it; otherwise staff may pick (this order only). */}
      <div className="w-11 h-12 flex flex-col gap-1 shrink-0" aria-label="Order unit">
        {(["CASE", "BOTTLE"] as const).map((u) => {
          const label = u === "CASE" ? "CS" : "BTL";
          if (item.unit) {
            const on = item.unit === u;
            return (
              <span key={u} className={`w-11 h-[22px] flex items-center justify-center text-[10px] font-semibold rounded ${on ? "bg-[var(--brand-olive)] text-white" : "bg-[var(--brand-cream)] text-[var(--ink-muted)] opacity-50"}`}>
                {label}
              </span>
            );
          }
          const on = pick === u;
          return (
            <button
              key={u}
              onClick={() => setPick(u)}
              aria-pressed={on}
              className={`w-11 h-[22px] flex items-center justify-center text-[10px] font-semibold rounded border border-dashed ${GOLD_BORDER} ${on ? "bg-[#D4A017] text-white" : "bg-white " + GOLD_TEXT}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center shrink-0">
        <button onClick={() => step(-0.5)} aria-label="Minus" className="w-9 sm:w-10 h-10 rounded-l-xl border border-[var(--line)] bg-white text-lg active:bg-[var(--line)]">−</button>
        {typing ? (
          <input
            autoFocus
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const n = parseFloat(draft);
              // Keep the number exactly as typed (to 2 decimals) — no snapping to 0.5.
              setCount(draft.trim() === "" ? null : Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : count ?? null);
              setTyping(false);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            // 16px: iPhone zooms the page into any text box smaller than that.
            className="w-12 h-10 border-y border-[var(--line)] text-center text-base font-semibold focus:outline-none"
          />
        ) : (
          <button
            onClick={() => { setDraft(counted ? String(count) : ""); setTyping(true); }}
            aria-label="Type a count"
            className={`w-12 h-10 border-y border-[var(--line)] text-sm font-semibold ${counted ? "bg-white text-[var(--brand-brown)]" : "bg-white text-[var(--ink-muted)]"}`}
          >
            {counted ? count : "—"}
          </button>
        )}
        <button onClick={() => step(0.5)} aria-label="Plus" className="w-9 sm:w-10 h-10 rounded-r-xl border border-[var(--line)] bg-white text-lg active:bg-[var(--line)]">+</button>
      </div>
    </div>
    </div>
  );
}

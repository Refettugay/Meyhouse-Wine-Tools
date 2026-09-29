"use client";

// Staff count page (phone-first, works on tablet). − / + move in 0.5-bottle
// steps; typing keeps the exact number (0.25, 0.1…). "−" on an uncounted item
// = 0 (out). Press and hold a row for the remove menu (same three choices as
// the admin Beverage tool). Counts are saved on the device as they go
// (survive lock/refresh) and cleared after a send.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listStaff, signIn, createPin, signOut, loadCountFeed, sendCounts, removeItem } from "./actions";
import type { CountFeed, CountItem, RemoveAction, StaffPerson } from "@/lib/staff-count/feed-types";
import { TYPE_CHIPS } from "@/lib/staff-count/types";
import { orderQty, type OrderUnit } from "@/lib/ordering-math";

type Stage = "loading" | "pick" | "pin" | "createPin" | "count" | "confirm" | "sent" | "error";
type Saved = { counts: Record<string, number>; picks: Record<string, OrderUnit>; request: string; savedAt: number };

const GOLD_BORDER = "border-[#D4A017]";
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
  const [sentSummary, setSentSummary] = useState<{ lines: number; counted: number } | null>(null);

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
          : { ...i, phasingOut: action === "mark" }),
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
            setBusy(true);
            const r = await signIn(token, who.id, pin);
            setBusy(false);
            if (r.ok) { setError(null); await openCount(); return; }
            if (r.needsPin) { setStage("createPin"); setError(null); return; }
            setError(r.error);
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
            const r = await createPin(token, who.id, pin);
            setBusy(false);
            if (r.ok) { setError(null); await openCount(); return; }
            setError(r.error);
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
      return { item: i, unit, qty: orderQty(i.par, counts[i.id], unit, i.casePack) };
    });
  const orderLines = toOrder.filter((l) => l.qty > 0);

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
                  setSentSummary({ lines: r.linesOrdered, counted: r.itemsCounted });
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
            {sentSummary ? `${sentSummary.counted} counted · ${sentSummary.lines} to order` : ""}
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
        setCount={(id, v) => setCounts((c) => {
          const next = { ...c };
          if (v === null) delete next[id]; else next[id] = v;
          return next;
        })}
        setPick={(id, u) => setPicks((p) => ({ ...p, [id]: u }))}
        onRemove={handleRemove}
      />
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-[var(--line)] px-4 py-3 flex items-center gap-3">
        <span className="text-xs text-[var(--ink-muted)] flex-1">
          <span className="font-semibold text-[var(--brand-brown)]">{toOrder.length}</span> counted ·{" "}
          <span className="font-semibold text-[var(--brand-olive)]">{orderLines.length}</span> to order
        </span>
        <button
          disabled={toOrder.length === 0 && !request.trim()}
          onClick={() => { setError(null); setStage("confirm"); }}
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
    <div className="h-full overflow-y-auto overscroll-contain bg-[var(--brand-cream)] pb-24">
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
    if (next.length === 4) { setPin(""); onComplete(next); return; } // dots clear while checking
    setPin(next);
  };
  return (
    <div className="px-6 py-6 flex flex-col items-center gap-4">
      <h2 className="text-base font-medium text-[var(--brand-brown)] text-center">{title}</h2>
      <div className="flex gap-3" aria-label="PIN">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`w-4 h-4 rounded-full border-2 border-[var(--brand-olive)] ${pin.length > i ? "bg-[var(--brand-olive)]" : ""}`} />
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
      {busy && <p className="text-xs text-[var(--ink-muted)]">Checking…</p>}
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
  feed, counts, picks, setCount, setPick, onRemove,
}: {
  feed: CountFeed;
  counts: Record<string, number>;
  picks: Record<string, OrderUnit>;
  setCount: (id: string, v: number | null) => void;
  setPick: (id: string, u: OrderUnit) => void;
  onRemove: (item: CountItem, action: RemoveAction) => Promise<string | null>;
}) {
  const [menuFor, setMenuFor] = useState<CountItem | null>(null);
  const [q, setQ] = useState("");
  const [groupBy, setGroupBy] = useState<"type" | "area">("area");
  const [chip, setChip] = useState<string>("ALL");
  const [offMenuOpen, setOffMenuOpen] = useState(false);

  const areaKey = (i: CountItem) => i.areaId ?? "none";
  const areaName = (k: string) => (k === "none" ? "Unassigned" : feed.areas.find((a) => a.id === k)?.name ?? "Unassigned");

  const chips = useMemo(() => {
    if (groupBy === "type") return TYPE_CHIPS.filter((t) => feed.items.some((i) => i.type === t)).map((t) => ({ key: t, label: t }));
    const keys = [...feed.areas.map((a) => a.id), ...(feed.items.some((i) => !i.areaId) ? ["none"] : [])];
    return keys.map((k) => ({ key: k, label: areaName(k) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, feed]);

  const sections = useMemo(() => {
    const term = q.trim().toLowerCase();
    const items = feed.items.filter((i) => !i.offMenu && (!term || i.name.toLowerCase().includes(term)));
    const keyOf = (i: CountItem) => (groupBy === "type" ? i.type : areaKey(i));
    return chips
      .filter((c) => chip === "ALL" || c.key === chip)
      .map((c) => ({ key: c.key, label: c.label, items: items.filter((i) => keyOf(i) === c.key) }))
      .filter((s) => s.items.length > 0);
  }, [feed, q, groupBy, chip, chips]);

  // Active items that aren't On Menu — same search/chip filter, shown last and collapsed.
  const offMenuItems = useMemo(() => {
    const term = q.trim().toLowerCase();
    const keyOf = (i: CountItem) => (groupBy === "type" ? i.type : areaKey(i));
    return feed.items.filter(
      (i) => i.offMenu && (!term || i.name.toLowerCase().includes(term)) && (chip === "ALL" || keyOf(i) === chip),
    );
  }, [feed, q, groupBy, chip]);

  const countedByOther = (k: string) => {
    const c = feed.countedToday[k];
    return c && !c.byMe ? c : null;
  };
  const chipBanner = groupBy === "area" && chip !== "ALL" ? countedByOther(chip) : null;

  return (
    <div>
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

      {sections.length === 0 && offMenuItems.length === 0 && <p className="text-center text-sm text-[var(--ink-muted)] py-10">No items match.</p>}
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
                  setCount={(v) => setCount(i.id, v)}
                  setPick={(u) => setPick(i.id, u)}
                  onHold={() => setMenuFor(i)}
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
                  setCount={(v) => setCount(i.id, v)}
                  setPick={(u) => setPick(i.id, u)}
                  onHold={() => setMenuFor(i)}
                />
              ))}
            </div>
          )}
        </section>
      )}
      {menuFor && <RemoveMenu item={menuFor} onClose={() => setMenuFor(null)} onRemove={onRemove} />}
    </div>
  );
}

// Bottom sheet opened by press-and-hold — same wording as the admin Beverage tool.
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

function CountRow({
  item, sub, count, pick, setCount, setPick, onHold,
}: {
  item: CountItem;
  sub: string;
  count: number | undefined;
  pick: OrderUnit | undefined;
  setCount: (v: number | null) => void;
  setPick: (u: OrderUnit) => void;
  onHold: () => void;
}) {
  const hold = useHold(onHold);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const counted = count !== undefined;
  const unit = item.unit ?? pick ?? null;
  const short = counted ? item.par - (count as number) : null;
  const qty = counted ? orderQty(item.par, count as number, unit, item.casePack) : 0;

  const step = (d: number) => {
    if (!counted) { setCount(d < 0 ? 0 : 0.5); return; } // "−" on uncounted = 0 (out)
    setCount(Math.max(0, Math.round(((count as number) + d) * 100) / 100)); // typed 0.25 → + → 0.75
  };
  const subParts = [sub, item.vendor, item.casePack ? `${item.casePack}/cs` : null].filter(Boolean);

  return (
    <div {...hold} className={`px-3 py-2 flex items-center gap-2 select-none [-webkit-touch-callout:none] ${counted ? "bg-[#FAF7F1]" : ""}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--brand-brown)] leading-snug line-clamp-2 break-words">
          {item.name}
          {item.size && <span className="ml-1.5 text-[11px] font-normal text-[var(--ink-muted)]">{item.size}</span>}
        </p>
        <p className="text-[11px] text-[var(--ink-muted)] truncate">
          {item.phasingOut && <span className="mr-1 text-amber-700 font-medium">Phasing out ·</span>}
          {subParts.join(" · ")}
        </p>
        {short !== null && (
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
  );
}

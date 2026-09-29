"use client";

// Staff Recipe Book (phones first, tablets second). Sign in with a PIN, then
// browse recipes and run the batch / liters / syrup calculators in EN / TR / ES.
// Layout, flows and look follow the approved mock
// (docs/recipe-book/bar-recipes-mock.html).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn, signOut, loadFeed, listPinless, createPin } from "./actions";
import { makeT, pick, LOCALE } from "./i18n";
import {
  calcPortions, calcLiters, calcMultiplier, fmt, fmtOz, fmtMl, fmtDashMl, fmtFrac, parseAmount, OZ_ML,
} from "@/lib/recipe-book/calc";
import type { Category, FeedResult, Lang, Recipe, RecipeFeed, RecipeIngredient, Store } from "@/lib/recipe-book/types";

type Stage = "loading" | "pin" | "setup" | "denied" | "app" | "message";
type T = ReturnType<typeof makeT>;

const LANG_KEY = "rb_lang";
const STORE_KEY = "rb_store";
const CATS: Category[] = ["craft", "na", "classic", "syrup"];
const REFRESH_MS = 60_000;

function storageGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function storageSet(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch {}
}
function scroller(): HTMLElement | null {
  return typeof document === "undefined" ? null : (document.querySelector(".rb") as HTMLElement | null);
}

export function RecipeBookApp({ token, linkActive }: { token: string; linkActive: boolean }) {
  const [lang, setLang] = useState<Lang>(() => {
    const l = storageGet(LANG_KEY);
    return l === "en" || l === "tr" || l === "es" ? l : "en";
  });
  const t = useMemo(() => makeT(lang), [lang]);
  const [stage, setStage] = useState<Stage>(linkActive ? "loading" : "message");
  const [message, setMessage] = useState<string>(linkActive ? "" : "bad_link");
  const [denied, setDenied] = useState<{ name: string; positions: string[] } | null>(null);
  const [feed, setFeed] = useState<RecipeFeed | null>(null);
  const lastLoad = useRef(0);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const changeLang = (l: Lang) => { setLang(l); storageSet(LANG_KEY, l); };

  const apply = useCallback((r: FeedResult, quiet: boolean) => {
    lastLoad.current = Date.now();
    if (r.ok) { setFeed(r.feed); setStage("app"); return; }
    if (r.error === "signed_out") {
      setFeed(null);
      if (quiet) setMessage("signed_out");
      setStage("pin");
      return;
    }
    setMessage(r.error);
    setStage("message");
  }, []);
  const refresh = useCallback(async (quiet: boolean) => apply(await loadFeed(token), quiet), [token, apply]);

  useEffect(() => {
    if (!linkActive) return;
    let live = true;
    loadFeed(token).then((r) => { if (live) apply(r, false); });
    return () => { live = false; };
  }, [linkActive, token, apply]);

  // Coming back to the tab: re-check access and pick up other people's edits.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && stage === "app" && Date.now() - lastLoad.current > REFRESH_MS) void refresh(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [stage, refresh]);

  async function handleSignOut() {
    await signOut(token);
    setFeed(null); setDenied(null); setMessage("");
    setStage("pin");
  }

  if (stage === "loading") {
    return <div className="wrap"><div className="pin"><Logo /><p className="muted" style={{ marginTop: 24 }}>{t("loading")}</p></div></div>;
  }
  if (stage === "message") {
    return (
      <div className="wrap">
        <div className="pin">
          <div className="pinlang"><LangSwitch lang={lang} onChange={changeLang} /></div>
          <Logo />
          <div className="sublogo" style={{ marginBottom: 18 }}>{t("bar")}</div>
          <p className="err" role="alert">{t(message || "server")}</p>
          {message === "server" && <button className="btn" style={{ marginTop: 16 }} onClick={() => { setStage("loading"); void refresh(false); }}>{t("back_signin")}</button>}
        </div>
      </div>
    );
  }
  if (stage === "pin") {
    return (
      <div className="wrap">
        <PinScreen
          t={t}
          lang={lang}
          onLang={changeLang}
          notice={message === "signed_out" ? t("signed_out") : ""}
          onPin={async (pin) => {
            const r = await signIn(token, pin);
            if (r.ok) { setMessage(""); await refresh(false); return null; }
            if ("denied" in r) { setDenied(r.denied); setStage("denied"); return null; }
            if (r.error === "wrong_pin" || r.error === "bad_format") return t("nomatch");
            setMessage(r.error); setStage("message");
            return null;
          }}
          footer={<button type="button" className="linkbtn hint" onClick={() => { setMessage(""); setStage("setup"); }}>{t("first_time")}</button>}
        />
      </div>
    );
  }
  if (stage === "setup") {
    return (
      <div className="wrap">
        <FirstPin
          t={t} lang={lang} onLang={changeLang} token={token}
          onBack={() => setStage("pin")}
          onDone={() => { void refresh(false); }}
          onFatal={(e) => { setMessage(e); setStage("message"); }}
        />
      </div>
    );
  }
  if (stage === "denied" && denied) {
    return (
      <div className="wrap">
        <div className="pin">
          <div className="pinlang"><LangSwitch lang={lang} onChange={changeLang} /></div>
          <Logo />
          <div className="sublogo" style={{ marginBottom: 18 }}>{t("bar")}</div>
          <h1>{t("denied_t")}</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {denied.positions.length ? t("denied_b", denied.name, denied.positions.join(", ")) : t("denied_b_nopos", denied.name)}
          </p>
          <button className="btn" style={{ marginTop: 16 }} onClick={() => { setDenied(null); setStage("pin"); }}>{t("back_signin")}</button>
        </div>
      </div>
    );
  }
  if (!feed) return null;
  return <Book feed={feed} t={t} lang={lang} onLang={changeLang} onSignOut={handleSignOut} />;
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
function Logo() {
  // Same asset as the Tip Entry staff page (launcher public/tip-entry/meyhouse-logo.png).
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="logo" src="/bar/meyhouse-logo.png" alt="Meyhouse Management Group" width={600} height={194} />;
}

function LangSwitch({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="lang" role="group" aria-label="Language">
      {(["en", "tr", "es"] as Lang[]).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => onChange(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

function GlassIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M5 4h14l-7 8z" /><path d="M12 12v7M8 20h8" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// PIN
// ---------------------------------------------------------------------------
function PinScreen({ t, lang, onLang, notice, onPin, title, sub, footer, onBack }: {
  t: T; lang: Lang; onLang: (l: Lang) => void; notice: string;
  onPin: (pin: string) => Promise<string | null>; // returns an error to show, or null
  title?: string; sub?: string; footer?: React.ReactNode; onBack?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(notice);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const pinRef = useRef("");
  const busyRef = useRef(false);

  const press = useCallback((k: string) => {
    if (busyRef.current) return;
    setErr("");
    const cur = pinRef.current;
    const next = k === "del" ? cur.slice(0, -1) : cur.length >= 4 ? cur : cur + k;
    pinRef.current = next;
    setPin(next);
    if (next.length !== 4) return;
    busyRef.current = true;
    setBusy(true);
    void (async () => {
      const e = await onPin(next);
      busyRef.current = false;
      pinRef.current = "";
      setBusy(false);
      setPin("");
      if (e) { setErr(e); setShake(true); setTimeout(() => setShake(false), 400); }
    })();
  }, [onPin]);

  // hardware keyboards (tablets with keyboards, desktop testing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("del");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  return (
    <div className="pin">
      <div className="pinlang"><LangSwitch lang={lang} onChange={onLang} /></div>
      <Logo />
      <div className="sublogo" style={{ marginBottom: 18 }}>{t("bar")}</div>
      {onBack && <div style={{ textAlign: "left" }}><button type="button" className="back" onClick={onBack}>{t("back")}</button></div>}
      <h1>{title ?? t("signin")}</h1>
      <p className="muted">{busy ? t("checking") : sub ?? t("signin_sub")}</p>
      <div className={`dots${shake ? " shake" : ""}`} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? "on" : ""} />)}
      </div>
      <div className="pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k, i) =>
          k === "" ? <span key={i} /> : (
            <button key={i} type="button" disabled={busy} onClick={() => press(k)} aria-label={k === "del" ? "Delete" : k}>
              {k === "del" ? "⌫" : k}
            </button>
          ),
        )}
      </div>
      <div className="err" role="alert">{err}</div>
      {footer}
    </div>
  );
}

// First time: pick your name (people with access and no PIN), choose a PIN, confirm it.
function FirstPin({ t, lang, onLang, token, onBack, onDone, onFatal }: {
  t: T; lang: Lang; onLang: (l: Lang) => void; token: string;
  onBack: () => void; onDone: () => void; onFatal: (e: string) => void;
}) {
  const [people, setPeople] = useState<{ id: string; name: string }[] | null>(null);
  const [who, setWho] = useState<{ id: string; name: string } | null>(null);
  const [first, setFirst] = useState<string | null>(null);
  const [round, setRound] = useState(0); // remounts the pad between steps
  const [err, setErr] = useState("");

  const fatal = useRef(onFatal);
  useEffect(() => { fatal.current = onFatal; });
  useEffect(() => {
    let live = true;
    listPinless(token).then((r) => {
      if (!live) return;
      if (r.ok) setPeople(r.people);
      else fatal.current(r.error);
    });
    return () => { live = false; };
  }, [token]);

  if (!who) {
    return (
      <div className="pin">
        <div className="pinlang"><LangSwitch lang={lang} onChange={onLang} /></div>
        <Logo />
        <div className="sublogo" style={{ marginBottom: 18 }}>{t("bar")}</div>
        <div style={{ textAlign: "left" }}><button type="button" className="back" onClick={onBack}>{t("back")}</button></div>
        <h1>{t("pick_name")}</h1>
        <p className="muted" style={{ marginBottom: 14 }}>{t("pick_sub")}</p>
        {people === null ? (
          <p className="muted">{t("loading")}</p>
        ) : people.length === 0 ? (
          <p className="muted">{t("none_pinless")}</p>
        ) : (
          <div className="group" style={{ marginTop: 0, textAlign: "left" }}>
            {people.map((p) => (
              <button key={p.id} type="button" className="row" onClick={() => { setWho(p); setErr(""); }}>
                <span className="n">{p.name}</span><span aria-hidden="true">{"›"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const firstName = who.name.split(" ")[0];
  return (
    <PinScreen
      key={round}
      t={t} lang={lang} onLang={onLang}
      notice={err}
      title={first === null ? t("choose_pin", firstName) : t("confirm_pin")}
      sub={t("pin_note")}
      onBack={() => { if (first !== null) { setFirst(null); setRound((r) => r + 1); } else { setWho(null); } setErr(""); }}
      onPin={async (pin) => {
        if (first === null) { setFirst(pin); setErr(""); setRound((r) => r + 1); return null; }
        if (pin !== first) { setFirst(null); setErr(t("mismatch")); setRound((r) => r + 1); return null; }
        const r = await createPin(token, who.id, pin);
        if (r.ok) { onDone(); return null; }
        if (r.error === "taken") { setFirst(null); setErr(t("taken")); setRound((x) => x + 1); return null; }
        if (r.error === "already_set" || r.error === "not_listed") { setErr(t("already_set")); onBack(); return null; }
        if (r.error === "bad_format") return t("nomatch");
        onFatal(r.error);
        return null;
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Signed in: list + recipe card
// ---------------------------------------------------------------------------
function Book({ feed, t, lang, onLang, onSignOut }: { feed: RecipeFeed; t: T; lang: Lang; onLang: (l: Lang) => void; onSignOut: () => void }) {
  const [rid, setRid] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");
  const [store, setStore] = useState<Store | "all">(() => {
    const s = storageGet(STORE_KEY);
    return s === "meyhouse" || s === "meze-kebab" ? s : "all";
  });
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const listScroll = useRef(0);

  const chooseStore = (s: Store | "all") => { setStore(s); storageSet(STORE_KEY, s); };

  const open = (id: string) => {
    listScroll.current = scroller()?.scrollTop ?? 0;
    setRid(id);
    requestAnimationFrame(() => scroller()?.scrollTo({ top: 0 }));
  };
  const back = () => {
    setRid(null);
    requestAnimationFrame(() => scroller()?.scrollTo({ top: listScroll.current }));
  };

  const roleLabel = feed.me.role === "staff" ? "" : t(`role_${feed.me.role}`);
  const recipe = rid ? feed.recipes.find((r) => r.id === rid) ?? null : null;

  return (
    <div className="wrap">
      <div className="top">
        <div><Logo /><div className="sublogo">{t("bar")}</div></div>
        <div className="who">
          <LangSwitch lang={lang} onChange={onLang} />
          <div>
            {feed.me.name}{roleLabel ? ` · ${roleLabel}` : ""} ·{" "}
            <button type="button" className="linkbtn" onClick={onSignOut}>{t("signout")}</button>
          </div>
        </div>
      </div>
      {recipe ? (
        <RecipeCard
          r={recipe} t={t} lang={lang} onBack={back}
          amount={amounts[recipe.id]}
          setAmount={(v) => setAmounts((a) => ({ ...a, [recipe.id]: v }))}
        />
      ) : (
        <List recipes={feed.recipes} t={t} lang={lang} q={q} setQ={setQ} cat={cat} setCat={setCat} store={store} setStore={chooseStore} onOpen={open} />
      )}
    </div>
  );
}

function matches(r: Recipe, q: string): boolean {
  if (!q) return true;
  const s = q.toLocaleLowerCase();
  if (r.name.toLocaleLowerCase().includes(s)) return true;
  return r.ingredients.some(
    (g) => Object.values(g.name).some((v) => v?.toLocaleLowerCase().includes(s)) || (g.batchName ?? "").toLocaleLowerCase().includes(s),
  );
}

function List({ recipes, t, lang, q, setQ, cat, setCat, store, setStore, onOpen }: {
  recipes: Recipe[]; t: T; lang: Lang; q: string; setQ: (v: string) => void;
  cat: Category | "all"; setCat: (c: Category | "all") => void;
  store: Store | "all"; setStore: (s: Store | "all") => void; onOpen: (id: string) => void;
}) {
  const items = recipes.filter((r) => (cat === "all" || r.category === cat) && (store === "all" || r.stores.includes(store)) && matches(r, q.trim()));
  const groups = CATS.map((c) => ({ c, rs: items.filter((r) => r.category === c) })).filter((g) => g.rs.length);
  const catLabel: Record<Category | "all", string> = { all: t("all"), craft: t("craft"), na: t("na"), classic: t("classics"), syrup: t("syrups") };
  return (
    <>
      <input className="search" type="search" placeholder={t("search")} aria-label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        {(["all", ...CATS] as (Category | "all")[]).map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{catLabel[c]}</button>
        ))}
      </div>
      <div className="chips">
        {([["all", t("both")], ["meyhouse", "Meyhouse"], ["meze-kebab", "Meze Kebab"]] as [Store | "all", string][]).map(([s, l]) => (
          <button key={s} type="button" className="chip" aria-pressed={store === s} onClick={() => setStore(s)}>{l}</button>
        ))}
      </div>
      {groups.length ? (
        <div className="groups">
          {groups.map((g) => (
            <div className="group" key={g.c}>
              <h2>{t(`cat_${g.c}`)} ({g.rs.length})</h2>
              {g.rs.map((r) => (
                <button key={r.id} type="button" className="row" onClick={() => onOpen(r.id)}>
                  <span className="left">
                    <span className="thumb ph"><GlassIcon /></span>
                    <span style={{ minWidth: 0 }}>
                      <span className="n">{r.name}</span>
                      <span className="t">{r.ingredients.slice(0, 3).map((i) => pick(i.name, lang)).join(", ")}</span>
                    </span>
                  </span>
                  <span className="tags">
                    {r.needsReview && <span className="tag flag">{t("check")}</span>}
                    {r.mode === "portions" && <span className="tag batch">{t("tag_batch")}</span>}
                    {r.mode === "liters" && <span className="tag batch">{t("tag_l")}</span>}
                    {r.mode === "multiplier" && <span className="tag batch">{t("tag_x")}</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 24 }}>{t("none_found", q)}</p>
      )}
    </>
  );
}

function RecipeCard({ r, t, lang, onBack, amount, setAmount }: {
  r: Recipe; t: T; lang: Lang; onBack: () => void; amount: string | undefined; setAmount: (v: string) => void;
}) {
  const steps = r.method ? r.method[lang] ?? r.method.en ?? [] : [];
  const showSpec = r.category !== "syrup" && r.mode !== "liters";
  const last = r.last
    ? t("last", r.last.by, new Date(r.last.at).toLocaleString(LOCALE[lang], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))
    : t("nochg");
  return (
    <>
      <button type="button" className="back" onClick={onBack}>{t("allr")}</button>
      <div className="rgrid">
        <div className="rleft">
          <div className="hero">
            <div className="photo ph"><GlassIcon /><span>{t("nophoto")}</span></div>
            <div className="rhead">
              <h1>{r.name}</h1>
              <div className="sub">
                {r.stores.map((s) => <span key={s} className="tag">{s === "meyhouse" ? "Meyhouse" : "Meze Kebab"}</span>)}
                {r.storage && <span className="store-badge">{t(r.storage)}</span>}
              </div>
            </div>
          </div>
          {showSpec ? (
            <dl className="spec">
              {(["glass", "ice", "garnish"] as const).map((k) => {
                const v = pick(r[k], lang);
                return <div key={k}><dt>{t(k)}</dt><dd>{v || <span className="muted">{t("notset")}</span>}</dd></div>;
              })}
            </dl>
          ) : <div style={{ height: 14 }} />}
          {pick(r.howTo, lang) && (
            <div className="howto"><h3>{t("howto")}</h3><p style={{ margin: "4px 0" }}>{pick(r.howTo, lang)}</p></div>
          )}
          {steps.length > 0 && (
            <div className="howto"><h3>{t("method")}</h3><ol>{steps.map((s, i) => <li key={i}>{s.replace(/^\d+\.\s*/, "")}</li>)}</ol></div>
          )}
          {pick(r.notes, lang) && <div className="notes">{pick(r.notes, lang)}</div>}
          <div className="foot"><span>{last}</span></div>
        </div>
        <div className="rright">
          <div className="calc"><Calculator r={r} t={t} lang={lang} amount={amount} setAmount={setAmount} /></div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Calculators
// ---------------------------------------------------------------------------
function Stepper({ label, value, onChange, step, id }: { label: string; value: string; onChange: (v: string) => void; step: number; id: string }) {
  const bump = (dir: number) => {
    const cur = parseAmount(value) ?? 0;
    onChange(String(Math.max(0, Math.round((cur + step * dir) * 100) / 100)));
  };
  return (
    <div className="qty">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <button type="button" onClick={() => bump(-1)} aria-label={`− ${step}`}>{"−"}</button>
        <input
          id={id}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            const v = e.target.value.replace(",", ".");
            if (v === "" || /^\d*\.?\d*$/.test(v)) onChange(v);
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" onClick={() => bump(1)} aria-label={`+ ${step}`}>+</button>
      </div>
    </div>
  );
}

function ingName(g: RecipeIngredient, lang: Lang) { return pick(g.name, lang); }

function Calculator({ r, t, lang, amount, setAmount }: { r: Recipe; t: T; lang: Lang; amount: string | undefined; setAmount: (v: string) => void }) {
  const [tab, setTab] = useState<"batch" | "single">("batch");

  if (r.mode === "portions") {
    const usual = r.defaultPortions ?? 1;
    const value = amount ?? String(usual);
    const n = parseAmount(value) ?? 0;
    const c = calcPortions(r, n);
    return (
      <>
        <div className="seg" role="group">
          <button type="button" aria-pressed={tab === "batch"} onClick={() => setTab("batch")}>{t("batch")}</button>
          <button type="button" aria-pressed={tab === "single"} onClick={() => setTab("single")}>{t("single")}</button>
        </div>
        {tab === "batch" ? (
          <>
            <Stepper id="amt" label={t("howmany")} value={value} onChange={setAmount} step={1} />
            <div className="quick">
              {[10, 16, 20, 25, 30].map((v) => <button key={v} type="button" onClick={() => setAmount(String(v))}>{v}</button>)}
              <button type="button" onClick={() => setAmount(String(usual))}>{t("usual")} ({fmt(usual, 2)})</button>
            </div>
            <table>
              <thead><tr><th>{t("ing")}</th><th>oz</th><th>ml</th></tr></thead>
              <tbody>
                {c.rows.map((x, i) => (
                  <tr key={i}>
                    <td>
                      {x.ing.batchName || ingName(x.ing, lang)}
                      {x.ing.batchName && <span className="bn">{ingName(x.ing, lang)} ({t("single").toLocaleLowerCase(LOCALE[lang])})</span>}
                    </td>
                    {x.kind === "dash" ? (
                      <>
                        <td className="a big">{fmt(x.dashes, 1)}<span className="bn">{t("dashes")}</span></td>
                        <td className="a">{fmtDashMl(x.ml)}</td>
                      </>
                    ) : (
                      <>
                        <td className="a big">{fmtOz(x.oz)}</td>
                        <td className="a">{fmtMl(x.ml)}</td>
                      </>
                    )}
                  </tr>
                ))}
                {c.dilutionOz > 0 && (
                  <tr className="dil">
                    <td>{t("water", fmt(r.dilutionPct * 100, 1))}</td>
                    <td className="a">{fmtOz(c.dilutionOz)}</td>
                    <td className="a">{fmtMl(c.dilutionOz * OZ_ML)}</td>
                  </tr>
                )}
                <tr className="total">
                  <td>{t("total")}</td>
                  <td className="a">{fmtOz(c.totalOz)}</td>
                  <td className="a">{fmtMl(c.totalOz * OZ_ML)}<span className="bn">{fmt((c.totalOz * OZ_ML) / 1000, 2)} L</span></td>
                </tr>
              </tbody>
            </table>
            {c.service.length > 0 && (
              <div className="service">
                <h3>{t("service")}</h3>
                {c.service.map((g, i) => (
                  <div key={i}>
                    {ingName(g, lang)} {"—"} {g.text ? pick(g.text, lang) : `${g.qty != null ? fmt(g.qty, 2) : ""} ${g.unit === "dash" ? t("dashes") : g.unit ?? ""}`.trim()}
                    {g.note && <span className="muted"> ({pick(g.note, lang)})</span>}
                  </div>
                ))}
              </div>
            )}
            {r.pourOz != null && (
              <div className="pour"><span>{t("pour")}</span><b>{fmt(r.pourOz, 2)} oz</b></div>
            )}
          </>
        ) : (
          <SingleTable r={r} t={t} lang={lang} />
        )}
      </>
    );
  }

  if (r.mode === "liters" && r.baseYieldL) {
    const value = amount ?? String(r.baseYieldL);
    const L = parseAmount(value) ?? 0;
    const c = calcLiters(r, L);
    return (
      <>
        <Stepper id="amt" label={t("howmanyL")} value={value} onChange={setAmount} step={0.5} />
        <div className="quick">
          <button type="button" onClick={() => setAmount(String(r.baseYieldL))}>{t("usual")} ({fmt(r.baseYieldL, 2)} L)</button>
        </div>
        <table>
          <thead><tr><th>{t("ing")}</th><th>{t("amount")}</th><th /></tr></thead>
          <tbody>
            {c.rows.map((x, i) => x.kind === "topUp" ? (
              <tr key={i}><td>{ingName(x.ing, lang)}{x.ing.text && <span className="bn">{pick(x.ing.text, lang)}</span>}</td><td className="a big">{`${t("to")} ${fmt(x.liters, 2)}`.trim()}</td><td className="a">L</td></tr>
            ) : (
              <tr key={i}><td>{ingName(x.ing, lang)}</td><td className="a big">{fmt(x.qty, x.decimals)}</td><td className="a">{x.ing.unit}</td></tr>
            ))}
            {c.glasses != null && (
              <tr className="total"><td>{t("about")}</td><td className="a">{fmt(c.glasses, 0)}</td><td className="a">{t("glasses")}</td></tr>
            )}
          </tbody>
        </table>
      </>
    );
  }

  if (r.mode === "multiplier") {
    const value = amount ?? "1";
    const m = parseAmount(value) ?? 0;
    const rows = calcMultiplier(r, m);
    return (
      <>
        <Stepper id="amt" label={t("howmanyX")} value={value} onChange={setAmount} step={0.5} />
        <div className="quick">
          {[0.5, 1, 2, 3].map((v) => <button key={v} type="button" onClick={() => setAmount(String(v))}>{"×"}{fmtFrac(v)}</button>)}
        </div>
        <table>
          <thead><tr><th>{t("ing")}</th><th>{t("amount")}</th><th /></tr></thead>
          <tbody>
            {rows.map((x, i) => x.kind === "text" ? (
              <tr key={i}><td>{ingName(x.ing, lang)}</td><td className="a big">{pick(x.ing.text, lang)}</td><td className="a">{"×"} {fmtFrac(x.times)}</td></tr>
            ) : (
              <tr key={i}><td>{ingName(x.ing, lang)}</td><td className="a big">{fmtFrac(x.qty)}</td><td className="a">{x.ing.unit ?? ""}</td></tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }

  // classics / non-batchable craft: recipe card only, no calculator
  return (
    <>
      <SingleTable r={r} t={t} lang={lang} />
      {r.pourOz != null && <div className="pour"><span>{t("pour")}</span><b>{fmt(r.pourOz, 2)} oz</b></div>}
    </>
  );
}

function SingleTable({ r, t, lang }: { r: Recipe; t: T; lang: Lang }) {
  return (
    <table>
      <thead><tr><th>{t("ing")}</th><th>{t("amount")}</th><th /></tr></thead>
      <tbody>
        {r.ingredients.map((g, i) => (
          <tr key={i}>
            <td>{ingName(g, lang)}{g.note && <span className="bn">{pick(g.note, lang)}</span>}</td>
            <td className="a big">{g.qty != null ? fmt(g.qty, 2) : pick(g.text, lang)}</td>
            <td className="a">{g.qty != null ? (g.unit === "dash" ? t("dashes") : g.unit ?? "") : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

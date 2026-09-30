"use client";

// The Recipe Book screens shared by the staff page (/bar/<token>, PIN for every
// save) and the admin copy (/dashboard/bar-recipes, login). Layout, flows and
// look follow the approved mock (docs/recipe-book/bar-recipes-mock.html).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pick, LOCALE } from "./i18n";
import { GlassIcon, LangSwitch, Logo, PinScreen, type T } from "./ui";
import { shrinkPhoto } from "./photo";
import type { BookApi } from "./api";
import { buildInput, dataOf, draftFrom, newDraft, nextKey, warnings, type Draft, type DraftIng } from "./draft";
import {
  calcPortions, calcLiters, calcMultiplier, fmt, fmtOz, fmtMl, fmtDashMl, fmtFrac, parseAmount, OZ_ML,
} from "@/lib/recipe-book/calc";
import {
  canSeeHistory, CATEGORIES, MODES, UNITS,
  type AccessOverview, type Category, type HistoryEntry, type HistoryFilters, type HistoryRow, type Lang,
  type Recipe, type RecipeFeed, type RecipeIngredient, type SaveInput, type SaveResult, type ScaleMode,
  type Snapshot, type Store, type Tri, type Unit,
} from "@/lib/recipe-book/types";

type View = "list" | "recipe" | "edit" | "history" | "histd" | "access";
type PinPurpose = { kind: "save"; input: SaveInput } | { kind: "archive"; id: string } | { kind: "revert"; logId: string };
type Modal =
  | { type: "zoom"; src: string }
  | { type: "warn"; list: string[]; input: SaveInput }
  | { type: "archive"; id: string; name: string }
  | { type: "pin"; purpose: PinPurpose };

const STORE_KEY = "rb_store";

function storageGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function storageSet(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch {}
}
// The staff page scrolls inside .rb; the admin copy scrolls the dashboard <main>.
function scroller(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const rb = document.querySelector(".rb") as HTMLElement | null;
  if (rb && getComputedStyle(rb).overflowY === "auto") return rb;
  return (rb?.closest("main") as HTMLElement | null) ?? (document.scrollingElement as HTMLElement | null);
}
const toTop = () => requestAnimationFrame(() => scroller()?.scrollTo({ top: 0 }));
const when = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleString(LOCALE[lang], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function Book({ feed, api, t, lang, onLang, onFeed, onSignOut, onSignedOut }: {
  feed: RecipeFeed; api: BookApi; t: T; lang: Lang; onLang: (l: Lang) => void;
  onFeed: (f: RecipeFeed) => void;
  onSignOut?: () => void; // staff page only
  onSignedOut: () => void; // the server said the session is gone
}) {
  const [view, setView] = useState<View>("list");
  const [rid, setRid] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "all" | "review">("all");
  const [store, setStore] = useState<Store | "all">(() => {
    const s = storageGet(STORE_KEY);
    return s === "meyhouse" || s === "meze-kebab" ? s : "all";
  });
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formErr, setFormErr] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);
  const [toast, setToast] = useState("");
  const [hid, setHid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listScroll = useRef(0);
  const manager = canSeeHistory(feed.me.role);

  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); }, []);
  const chooseStore = (s: Store | "all") => { setStore(s); storageSet(STORE_KEY, s); };

  const go = (v: View) => { setView(v); setModal(null); toTop(); };
  const openRecipe = (id: string) => { listScroll.current = scroller()?.scrollTop ?? 0; setRid(id); go("recipe"); };
  const backToList = () => {
    setView("list"); setRid(null);
    requestAnimationFrame(() => scroller()?.scrollTo({ top: listScroll.current }));
  };

  const recipe = rid ? feed.recipes.find((r) => r.id === rid) ?? null : null;

  async function reloadFeed(): Promise<boolean> {
    const r = await api.reload();
    if (r.ok) { onFeed(r.feed); return true; }
    if (r.error === "signed_out") onSignedOut();
    return false;
  }

  // ---------------- saving (+ PIN on the staff page) ----------------
  function handleResult(r: SaveResult, purpose: PinPurpose): string | null {
    if (r.ok) {
      setModal(null);
      void reloadFeed().then(() => {
        if (purpose.kind === "save") { setRid(r.id); setDraft(null); go("recipe"); flash(t("saved", r.by)); }
        else if (purpose.kind === "archive") { setRid(null); setDraft(null); go("list"); flash(t("archived_toast")); }
        else { setHid(null); go("history"); flash(t("reverted")); }
      });
      return null;
    }
    switch (r.error) {
      case "wrong_pin": return t("nomatch");
      case "no_access": return t("no_access_pin");
      case "forbidden": return t("forbidden");
      case "signed_out": setModal(null); onSignedOut(); return null;
      case "nothing": setModal(null); flash(t("nothing")); return null;
      case "conflict": setModal(null); setFormErr(t("conflict")); return null;
      case "invalid": setModal(null); setFormErr(r.message || t("server")); return null;
      default: setModal(null); setFormErr(t("server")); return null;
    }
  }

  async function run(purpose: PinPurpose, pin: string | null): Promise<string | null> {
    const r =
      purpose.kind === "save" ? await api.save(purpose.input, pin)
      : purpose.kind === "archive" ? await api.setActive(purpose.id, false, pin)
      : await api.revert(purpose.logId, pin);
    return handleResult(r, purpose);
  }

  async function start(purpose: PinPurpose) {
    setFormErr("");
    if (api.needsPin) { setModal({ type: "pin", purpose }); return; }
    setBusy(true);
    try { await run(purpose, null); } finally { setBusy(false); }
  }

  function requestSave() {
    if (!draft) return;
    const built = buildInput(draft, lang);
    const original = draft.id ? feed.recipes.find((r) => r.id === draft.id) ?? null : null;
    if (original && built.photo.kind === "keep" && JSON.stringify(dataOf(original)) === JSON.stringify(built.data)) { flash(t("nothing")); return; }
    const w = warnings(original, built.data, t, lang, pick);
    if (w.length) { setModal({ type: "warn", list: w, input: built }); return; }
    void start({ kind: "save", input: built });
  }

  // ---------------- render ----------------
  const roleLabel = feed.me.role === "staff" ? "" : t(`role_${feed.me.role}`);
  const tab = (v: View, label: string, active: boolean) => (
    <button type="button" className="tab" aria-pressed={active} onClick={() => { if (v === "list") { setRid(null); setDraft(null); } go(v); }}>{label}</button>
  );

  return (
    <div className="wrap">
      <div className="top">
        <div><Logo /><div className="sublogo">{t("bar")}</div></div>
        <div className="who">
          <LangSwitch lang={lang} onChange={onLang} />
          <div>
            {feed.me.name}{roleLabel ? ` · ${roleLabel}` : ""}
            {onSignOut && <> · <button type="button" className="linkbtn" onClick={onSignOut}>{t("signout")}</button></>}
          </div>
        </div>
      </div>
      {manager && (
        <div className="tabs" role="group">
          {tab("list", t("t_recipes"), view === "list" || view === "recipe" || view === "edit")}
          {tab("history", t("t_hist"), view === "history" || view === "histd")}
          {tab("access", t("t_access"), view === "access")}
        </div>
      )}

      {view === "list" && (
        <List
          recipes={feed.recipes} t={t} lang={lang} q={q} setQ={setQ} cat={cat} setCat={setCat} store={store} setStore={chooseStore}
          onOpen={openRecipe}
          onNew={() => { setDraft(newDraft(store)); setFormErr(""); go("edit"); }}
        />
      )}
      {view === "recipe" && recipe && (
        <RecipeCard
          r={recipe} t={t} lang={lang} onBack={backToList}
          amount={amounts[recipe.id]}
          setAmount={(v) => setAmounts((a) => ({ ...a, [recipe.id]: v }))}
          onZoom={(src) => setModal({ type: "zoom", src })}
          onEdit={() => { setDraft(draftFrom(recipe)); setFormErr(""); go("edit"); }}
        />
      )}
      {view === "edit" && draft && (
        <Editor
          draft={draft} setDraft={setDraft} t={t} lang={lang} busy={busy} formErr={formErr}
          onCancel={() => { const id = draft.id; setDraft(null); setFormErr(""); if (id) { setRid(id); go("recipe"); } else go("list"); }}
          onSave={requestSave}
          onArchive={draft.id ? () => setModal({ type: "archive", id: draft.id!, name: draft.name }) : undefined}
        />
      )}
      {view === "history" && manager && (
        <History api={api} t={t} lang={lang} onOpen={(id) => { setHid(id); go("histd"); }} onSignedOut={onSignedOut} />
      )}
      {view === "histd" && manager && hid && (
        <HistoryDetail
          api={api} id={hid} t={t} lang={lang} busy={busy}
          onBack={() => go("history")}
          onRevert={(logId) => void start({ kind: "revert", logId })}
          onZoom={(src) => setModal({ type: "zoom", src })}
        />
      )}
      {view === "access" && manager && <Access api={api} t={t} />}

      {modal?.type === "zoom" && (
        <div className="modal" role="dialog" aria-modal="true" onClick={() => setModal(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="big-photo" src={modal.src} alt="" />
            <div className="sheet-actions" style={{ justifyContent: "center" }}><button type="button" className="btn ghost" onClick={() => setModal(null)}>{t("close")}</button></div>
          </div>
        </div>
      )}
      {modal?.type === "warn" && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet">
            <h2 style={{ fontSize: 24 }}>{t("chk")}</h2>
            <ul className="warnbox">{modal.list.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <div className="sheet-actions">
              <button type="button" className="btn ghost" onClick={() => setModal(null)}>{t("fix")}</button>
              <button type="button" className="btn warn" onClick={() => void start({ kind: "save", input: modal.input })}>{t("anyway")}</button>
            </div>
          </div>
        </div>
      )}
      {modal?.type === "archive" && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet">
            <h2 style={{ fontSize: 24 }}>{t("archive")}</h2>
            <p style={{ margin: "10px 0" }}>{t("archive_q", modal.name)}</p>
            <div className="sheet-actions">
              <button type="button" className="btn ghost" onClick={() => setModal(null)}>{t("cancel")}</button>
              <button type="button" className="btn warn" onClick={() => void start({ kind: "archive", id: modal.id })}>{t("archive_yes")}</button>
            </div>
          </div>
        </div>
      )}
      {modal?.type === "pin" && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet">
            <PinScreen
              header={false} t={t} lang={lang} onLang={onLang} notice=""
              title={modal.purpose.kind === "revert" ? t("pin_revert") : t("pin_save")}
              sub={t("pin_save_sub")}
              onPin={(pin) => run(modal.purpose, pin)}
              footer={<div className="sheet-actions" style={{ justifyContent: "center" }}><button type="button" className="btn ghost" onClick={() => setModal(null)}>{t("back_edit")}</button></div>}
            />
          </div>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

// ===========================================================================
// List
// ===========================================================================
function matches(r: Recipe, q: string): boolean {
  if (!q) return true;
  const s = q.toLocaleLowerCase();
  if (r.name.toLocaleLowerCase().includes(s)) return true;
  return r.ingredients.some(
    (g) => Object.values(g.name).some((v) => v?.toLocaleLowerCase().includes(s)) || (g.batchName ?? "").toLocaleLowerCase().includes(s),
  );
}
const flagged = (r: Recipe) => r.needsReview || r.needsSpec;

function Thumb({ r }: { r: Recipe }) {
  // eslint-disable-next-line @next/next/no-img-element
  return r.thumbUrl ? <img className="thumb" src={r.thumbUrl} alt="" loading="lazy" /> : <span className="thumb ph"><GlassIcon /></span>;
}

function List({ recipes, t, lang, q, setQ, cat, setCat, store, setStore, onOpen, onNew }: {
  recipes: Recipe[]; t: T; lang: Lang; q: string; setQ: (v: string) => void;
  cat: Category | "all" | "review"; setCat: (c: Category | "all" | "review") => void;
  store: Store | "all"; setStore: (s: Store | "all") => void; onOpen: (id: string) => void; onNew: () => void;
}) {
  const items = recipes.filter((r) =>
    (cat === "all" || (cat === "review" ? flagged(r) : r.category === cat)) && (store === "all" || r.stores.includes(store)) && matches(r, q.trim()));
  const groups = CATEGORIES.map((c) => ({ c, rs: items.filter((r) => r.category === c) })).filter((g) => g.rs.length);
  const nReview = recipes.filter(flagged).length;
  const catLabel: Record<Category | "all", string> = { all: t("all"), craft: t("craft"), na: t("na"), classic: t("classics"), syrup: t("syrups") };
  return (
    <>
      <input className="search" type="search" placeholder={t("search")} aria-label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        {(["all", ...CATEGORIES] as (Category | "all")[]).map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{catLabel[c]}</button>
        ))}
        {nReview > 0 && <button type="button" className="chip" aria-pressed={cat === "review"} onClick={() => setCat(cat === "review" ? "all" : "review")}>{t("check")} ({nReview})</button>}
      </div>
      <div className="chips">
        {([["all", t("both")], ["meyhouse", "Meyhouse"], ["meze-kebab", "Meze Kebab"]] as [Store | "all", string][]).map(([s, l]) => (
          <button key={s} type="button" className="chip" aria-pressed={store === s} onClick={() => setStore(s)}>{l}</button>
        ))}
      </div>
      <div className="listbar"><button type="button" className="btn ghost" onClick={onNew}>{t("new_recipe")}</button></div>
      {groups.length ? (
        <div className="groups">
          {groups.map((g) => (
            <div className="group" key={g.c}>
              <h2>{t(`cat_${g.c}`)} ({g.rs.length})</h2>
              {g.rs.map((r) => (
                <button key={r.id} type="button" className="row" onClick={() => onOpen(r.id)}>
                  <span className="left">
                    <Thumb r={r} />
                    <span style={{ minWidth: 0 }}>
                      <span className="n">{r.name}</span>
                      <span className="t">{r.ingredients.slice(0, 3).map((i) => pick(i.name, lang)).join(", ")}</span>
                    </span>
                  </span>
                  <span className="tags">
                    {flagged(r) && <span className="tag flag">{t("check")}</span>}
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

// ===========================================================================
// Recipe card + calculators
// ===========================================================================
function RecipeCard({ r, t, lang, onBack, amount, setAmount, onZoom, onEdit }: {
  r: Recipe; t: T; lang: Lang; onBack: () => void; amount: string | undefined; setAmount: (v: string) => void;
  onZoom: (src: string) => void; onEdit: () => void;
}) {
  const steps = r.method ? r.method[lang] ?? r.method.en ?? [] : [];
  const showSpec = r.category !== "syrup" && r.mode !== "liters";
  return (
    <>
      <button type="button" className="back" onClick={onBack}>{t("allr")}</button>
      <div className="rgrid">
        <div className="rleft">
          <div className="hero">
            {r.photoUrl ? (
              <button type="button" className="photo" onClick={() => onZoom(r.photoUrl!)} aria-label={t("tapzoom")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="photo" src={r.photoUrl} alt={r.name} />
              </button>
            ) : (
              <div className="photo ph"><GlassIcon /><span>{t("nophoto")}</span></div>
            )}
            <div className="rhead">
              <h1>{r.name}</h1>
              <div className="sub">
                {r.stores.map((s) => <span key={s} className="tag">{s === "meyhouse" ? "Meyhouse" : "Meze Kebab"}</span>)}
                {r.storage && <span className="store-badge">{t(r.storage)}</span>}
                {flagged(r) && <span className="tag flag">{t("check")}</span>}
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
          {pick(r.howTo, lang) && <div className="howto"><h3>{t("howto")}</h3><p style={{ margin: "4px 0" }}>{pick(r.howTo, lang)}</p></div>}
          {steps.length > 0 && <div className="howto"><h3>{t("method")}</h3><ol>{steps.map((s, i) => <li key={i}>{s.replace(/^\d+\.\s*/, "")}</li>)}</ol></div>}
          {pick(r.notes, lang) && <div className="notes">{pick(r.notes, lang)}</div>}
          <div className="foot">
            <span>{r.last ? t("last", r.last.by, when(r.last.at, lang)) : t("nochg")}</span>
            <button type="button" className="btn ghost" onClick={onEdit}>{t("edit")}</button>
          </div>
        </div>
        <div className="rright">
          <div className="calc"><Calculator r={r} t={t} lang={lang} amount={amount} setAmount={setAmount} /></div>
        </div>
      </div>
    </>
  );
}

function Stepper({ label, value, onChange, step }: { label: string; value: string; onChange: (v: string) => void; step: number }) {
  const bump = (dir: number) => {
    const cur = parseAmount(value) ?? 0;
    onChange(String(Math.max(0, Math.round((cur + step * dir) * 100) / 100)));
  };
  return (
    <div className="qty">
      <label htmlFor="amt">{label}</label>
      <div className="stepper">
        <button type="button" onClick={() => bump(-1)} aria-label={`− ${step}`}>−</button>
        <input
          id="amt" inputMode="decimal" enterKeyHint="done" autoComplete="off" value={value}
          onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) onChange(v); }}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" onClick={() => bump(1)} aria-label={`+ ${step}`}>+</button>
      </div>
    </div>
  );
}

const ingName = (g: RecipeIngredient, lang: Lang) => pick(g.name, lang);

function Calculator({ r, t, lang, amount, setAmount }: { r: Recipe; t: T; lang: Lang; amount: string | undefined; setAmount: (v: string) => void }) {
  const [tab, setTab] = useState<"batch" | "single">("batch");

  if (r.mode === "portions") {
    const usual = r.defaultPortions ?? 1;
    const value = amount ?? String(usual);
    const c = calcPortions(r, parseAmount(value) ?? 0);
    return (
      <>
        <div className="seg" role="group">
          <button type="button" aria-pressed={tab === "batch"} onClick={() => setTab("batch")}>{t("batch")}</button>
          <button type="button" aria-pressed={tab === "single"} onClick={() => setTab("single")}>{t("single")}</button>
        </div>
        {tab === "batch" ? (
          <>
            <Stepper label={t("howmany")} value={value} onChange={setAmount} step={1} />
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
                      <><td className="a big">{fmt(x.dashes, 1)}<span className="bn">{t("dashes")}</span></td><td className="a">{fmtDashMl(x.ml)}</td></>
                    ) : (
                      <><td className="a big">{fmtOz(x.oz)}</td><td className="a">{fmtMl(x.ml)}</td></>
                    )}
                  </tr>
                ))}
                {c.dilutionOz > 0 && (
                  <tr className="dil"><td>{t("water", fmt(r.dilutionPct * 100, 1))}</td><td className="a">{fmtOz(c.dilutionOz)}</td><td className="a">{fmtMl(c.dilutionOz * OZ_ML)}</td></tr>
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
                    {ingName(g, lang)} — {g.text ? pick(g.text, lang) : `${g.qty != null ? fmt(g.qty, 2) : ""} ${g.unit === "dash" ? t("dashes") : g.unit ?? ""}`.trim()}
                    {g.note && <span className="muted"> ({pick(g.note, lang)})</span>}
                  </div>
                ))}
              </div>
            )}
            {r.pourOz != null && <div className="pour"><span>{t("pour")}</span><b>{fmt(r.pourOz, 2)} oz</b></div>}
          </>
        ) : (
          <SingleTable r={r} t={t} lang={lang} />
        )}
      </>
    );
  }

  if (r.mode === "liters" && r.baseYieldL) {
    const value = amount ?? String(r.baseYieldL);
    const c = calcLiters(r, parseAmount(value) ?? 0);
    return (
      <>
        <Stepper label={t("howmanyL")} value={value} onChange={setAmount} step={0.5} />
        <div className="quick"><button type="button" onClick={() => setAmount(String(r.baseYieldL))}>{t("usual")} ({fmt(r.baseYieldL, 2)} L)</button></div>
        <table>
          <thead><tr><th>{t("ing")}</th><th>{t("amount")}</th><th /></tr></thead>
          <tbody>
            {c.rows.map((x, i) => x.kind === "topUp" ? (
              <tr key={i}><td>{ingName(x.ing, lang)}{x.ing.text && <span className="bn">{pick(x.ing.text, lang)}</span>}</td><td className="a big">{`${t("to")} ${fmt(x.liters, 2)}`.trim()}</td><td className="a">L</td></tr>
            ) : (
              <tr key={i}><td>{ingName(x.ing, lang)}</td><td className="a big">{fmt(x.qty, x.decimals)}</td><td className="a">{x.ing.unit}</td></tr>
            ))}
            {c.glasses != null && <tr className="total"><td>{t("about")}</td><td className="a">{fmt(c.glasses, 0)}</td><td className="a">{t("glasses")}</td></tr>}
          </tbody>
        </table>
      </>
    );
  }

  if (r.mode === "multiplier") {
    const value = amount ?? "1";
    const rows = calcMultiplier(r, parseAmount(value) ?? 0);
    return (
      <>
        <Stepper label={t("howmanyX")} value={value} onChange={setAmount} step={0.5} />
        <div className="quick">{[0.5, 1, 2, 3].map((v) => <button key={v} type="button" onClick={() => setAmount(String(v))}>×{fmtFrac(v)}</button>)}</div>
        <table>
          <thead><tr><th>{t("ing")}</th><th>{t("amount")}</th><th /></tr></thead>
          <tbody>
            {rows.map((x, i) => x.kind === "text" ? (
              <tr key={i}><td>{ingName(x.ing, lang)}</td><td className="a big">{pick(x.ing.text, lang)}</td><td className="a">× {fmtFrac(x.times)}</td></tr>
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

function SingleTable({ r, t, lang }: { r: Pick<Recipe, "ingredients">; t: T; lang: Lang }) {
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

// ===========================================================================
// Editor (same form on the staff page and in admin)
// ===========================================================================
function Editor({ draft, setDraft, t, lang, busy, formErr, onCancel, onSave, onArchive }: {
  draft: Draft; setDraft: (d: Draft) => void; t: T; lang: Lang; busy: boolean; formErr: string;
  onCancel: () => void; onSave: () => void; onArchive?: () => void;
}) {
  const d = draft;
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });
  const setTri = (k: "glass" | "ice" | "garnish" | "howTo" | "notes", v: string) => set({ [k]: { ...d[k], [lang]: v } } as Partial<Draft>);
  const setIng = (i: number, patch: Partial<DraftIng>) => set({ ingredients: d.ingredients.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= d.ingredients.length) return;
    const list = [...d.ingredients];
    [list[i], list[j]] = [list[j], list[i]];
    set({ ingredients: list });
  };
  const showSpec = d.category !== "syrup" && d.mode !== "liters";
  const hint = (v: Tri | null | undefined) => (lang === "en" ? "" : v?.en ?? "");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setPhotoErr(""); setPhotoBusy(true);
    try {
      const p = await shrinkPhoto(f);
      if (!p.full || !p.thumb) throw new Error("empty");
      setDraft({ ...d, photo: { kind: "new", full: p.full, thumb: p.thumb }, photoPreview: p.preview });
    } catch {
      setPhotoErr(t("ph_bad"));
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <div className="editwrap">
      <button type="button" className="back" onClick={onCancel}>{t("cancel_e")}</button>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{d.id ? t("edit_t", d.name) : t("new_t")}</h1>
      <div className="demo">{t("ed_lang")}</div>

      <div className="field">
        <span className="lbl">{t("photo")}</span>
        <div className="photo-edit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {d.photoPreview ? <img src={d.photoPreview} alt="" /> : <span className="ph"><GlassIcon /></span>}
          <span className="filebtn btn ghost">
            {photoBusy ? t("ph_busy") : d.photoPreview ? t("chph") : t("addph")}
            <input type="file" accept="image/*" aria-label={t("addph")} onChange={onFile} disabled={photoBusy} />
          </span>
          {d.photoPreview && <button type="button" className="btn ghost" onClick={() => setDraft({ ...d, photo: { kind: "remove" }, photoPreview: null })}>{t("rmph")}</button>}
        </div>
        {photoErr && <p className="formerr">{photoErr}</p>}
      </div>

      <div className="field"><label htmlFor="f-name">{t("name")}</label><input id="f-name" value={d.name} onChange={(e) => set({ name: e.target.value })} /></div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="f-cat">{t("category")}</label>
          <select id="f-cat" value={d.category} onChange={(e) => set({ category: e.target.value as Category })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat_${c}`)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-mode">{t("calc_type")}</label>
          <select id="f-mode" value={d.mode} onChange={(e) => set({ mode: e.target.value as ScaleMode })}>
            {MODES.map((m) => <option key={m} value={m}>{t(`mode_${m}`)}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <span className="lbl">{t("stores")}</span>
        <div className="checks">
          {(["meyhouse", "meze-kebab"] as Store[]).map((s) => (
            <label key={s} className="check">
              <input type="checkbox" checked={d.stores.includes(s)} onChange={(e) => set({ stores: e.target.checked ? [...d.stores, s] : d.stores.filter((x) => x !== s) })} />
              {s === "meyhouse" ? "Meyhouse" : "Meze Kebab"}
            </label>
          ))}
        </div>
      </div>

      {showSpec && (
        <>
          <div className="grid2">
            <div className="field"><label htmlFor="f-glass">{t("glass")}</label><input id="f-glass" value={d.glass[lang] ?? ""} placeholder={hint(d.glass)} onChange={(e) => setTri("glass", e.target.value)} /></div>
            <div className="field"><label htmlFor="f-ice">{t("ice")}</label><input id="f-ice" value={d.ice[lang] ?? ""} placeholder={hint(d.ice)} onChange={(e) => setTri("ice", e.target.value)} /></div>
          </div>
          <div className="field"><label htmlFor="f-garnish">{t("garnish")}</label><input id="f-garnish" value={d.garnish[lang] ?? ""} placeholder={hint(d.garnish)} onChange={(e) => setTri("garnish", e.target.value)} /></div>
        </>
      )}
      <div className="grid2">
        <div className="field">
          <label htmlFor="f-storage">{t("storage")}</label>
          <select id="f-storage" value={d.storage ?? ""} onChange={(e) => set({ storage: (e.target.value || null) as Draft["storage"] })}>
            <option value="">{t("none")}</option>
            <option value="fridge">{t("fridge")}</option>
            <option value="freezer">{t("freezer")}</option>
          </select>
        </div>
        <div className="field"><label htmlFor="f-pour">{t("pouroz")}</label><input id="f-pour" inputMode="decimal" value={d.pourOz} onChange={(e) => set({ pourOz: e.target.value })} /></div>
      </div>
      {d.mode === "portions" && (
        <div className="grid2">
          <div className="field"><label htmlFor="f-dp">{t("usualb")}</label><input id="f-dp" inputMode="decimal" value={d.defaultPortions} onChange={(e) => set({ defaultPortions: e.target.value })} /></div>
          <div className="field"><label htmlFor="f-dil">{t("dilution")}</label><input id="f-dil" inputMode="decimal" value={d.dilution} placeholder="0" onChange={(e) => set({ dilution: e.target.value })} /></div>
        </div>
      )}
      {d.mode === "liters" && (
        <div className="grid2">
          <div className="field"><label htmlFor="f-by">{t("base_yield")}</label><input id="f-by" inputMode="decimal" value={d.baseYieldL} onChange={(e) => set({ baseYieldL: e.target.value })} /></div>
          <div className="field"><label htmlFor="f-gl">{t("glass_l")}</label><input id="f-gl" inputMode="decimal" value={d.glassL} onChange={(e) => set({ glassL: e.target.value })} /></div>
        </div>
      )}
      <div className="field"><label htmlFor="f-how">{t("howto")}</label><textarea id="f-how" rows={3} value={d.howTo[lang] ?? ""} placeholder={hint(d.howTo)} onChange={(e) => setTri("howTo", e.target.value)} /></div>
      {(d.mode === "liters" || d.mode === "multiplier" || Object.keys(d.method).length > 0) && (
        <div className="field">
          <label htmlFor="f-method">{t("method_edit")}</label>
          <textarea id="f-method" rows={5} value={d.method[lang] ?? ""} placeholder={lang === "en" ? "" : d.method.en ?? ""} onChange={(e) => set({ method: { ...d.method, [lang]: e.target.value } })} />
        </div>
      )}
      <div className="field"><label htmlFor="f-notes">{t("notes")}</label><textarea id="f-notes" rows={2} value={d.notes[lang] ?? ""} placeholder={hint(d.notes)} onChange={(e) => setTri("notes", e.target.value)} /></div>
      <div className="checks" style={{ marginBottom: 8 }}>
        <label className="check"><input type="checkbox" checked={d.needsReview} onChange={(e) => set({ needsReview: e.target.checked })} />{t("needs_review")}</label>
        <label className="check"><input type="checkbox" checked={d.needsSpec} onChange={(e) => set({ needsSpec: e.target.checked })} />{t("needs_spec")}</label>
      </div>

      <h2 style={{ fontSize: 20, margin: "18px 0 4px" }}>{d.mode === "liters" || d.mode === "multiplier" ? t("ings_base") : t("ings")}</h2>
      {d.mode === "portions" && <p className="muted" style={{ margin: "0 0 6px", fontSize: 14 }}>{t("ings_sub")}</p>}
      {d.ingredients.map((g, i) => {
        const isNum = g.amt.trim() !== "" || !(g.text && (g.text[lang] || g.text.en));
        const amtValue = isNum ? g.amt : g.text?.[lang] ?? "";
        return (
          <div className="ing" key={g.key}>
            <input aria-label={t("ing")} value={g.name[lang] ?? ""} placeholder={lang === "en" ? t("ing") : g.name.en ?? ""} onChange={(e) => setIng(i, { name: { ...g.name, [lang]: e.target.value } })} />
            <input
              aria-label={t("amount")}
              inputMode="decimal"
              value={amtValue}
              placeholder={!isNum ? g.text?.en ?? "" : ""}
              onChange={(e) => {
                const v = e.target.value;
                const normalized = v.replace(",", ".");
                if (v.trim() === "" || /^-?\d*\.?\d*$/.test(normalized)) setIng(i, { amt: normalized, text: v.trim() === "" ? g.text : null });
                else setIng(i, { amt: "", text: { ...(g.text ?? {}), [lang]: v } });
              }}
            />
            <select aria-label="unit" value={g.unit ?? ""} onChange={(e) => setIng(i, { unit: (e.target.value || null) as Unit | null })}>
              <option value="">{t("text_amt")}</option>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <div className="row2">
              {d.mode === "portions" && (
                <label className="check"><input type="checkbox" checked={g.inBatch} onChange={(e) => setIng(i, { inBatch: e.target.checked })} />{t("inbatch")}</label>
              )}
              {d.mode === "portions" && g.inBatch && (
                <input className="bname" aria-label={t("batch_name")} placeholder={t("batch_name")} value={g.batchName} onChange={(e) => setIng(i, { batchName: e.target.value })} />
              )}
              <span className="spacer" />
              <button type="button" className="iconbtn" aria-label={t("move_up")} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="iconbtn" aria-label={t("move_down")} disabled={i === d.ingredients.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="iconbtn danger" aria-label={t("remove_ing")} onClick={() => set({ ingredients: d.ingredients.filter((_, j) => j !== i) })}>×</button>
            </div>
          </div>
        );
      })}
      <button
        type="button" className="btn ghost" style={{ marginTop: 10 }}
        onClick={() => set({ ingredients: [...d.ingredients, { key: nextKey(), name: {}, amt: "", text: null, unit: d.mode === "portions" ? "oz" : null, inBatch: d.mode === "portions", batchName: "", note: null }] })}
      >{t("add")}</button>
      {onArchive && (
        <div style={{ marginTop: 22 }}>
          <button type="button" className="linkbtn" style={{ color: "var(--warn)" }} onClick={onArchive} disabled={busy}>{t("archive")}</button>
        </div>
      )}
      {formErr && <p className="formerr" role="alert">{formErr}</p>}
      <div className="sticky">
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>{t("cancel")}</button>
        <button type="button" className="btn" onClick={onSave} disabled={busy || photoBusy || !d.name.trim() || d.stores.length === 0}>{busy ? t("saving") : t("save")}</button>
      </div>
    </div>
  );
}

// ===========================================================================
// Change history (owners + managers)
// ===========================================================================
function actionTag(a: HistoryRow["action"], t: T) {
  if (a === "update") return null;
  return <span className="tag flag" style={{ marginLeft: 6 }}>{t(`act_${a}`)}</span>;
}

function History({ api, t, lang, onOpen, onSignedOut }: { api: BookApi; t: T; lang: Lang; onOpen: (id: string) => void; onSignedOut: () => void }) {
  const [filters, setFilters] = useState<HistoryFilters>({});
  const [data, setData] = useState<{ rows: HistoryRow[]; people: string[]; recipes: { id: string; name: string }[] } | null>(null);
  const [err, setErr] = useState("");
  const signedOut = useRef(onSignedOut);
  useEffect(() => { signedOut.current = onSignedOut; });

  useEffect(() => {
    let live = true;
    api.history(filters).then((r) => {
      if (!live) return;
      if (r.ok) { setData({ rows: r.rows, people: r.people, recipes: r.recipes }); setErr(""); }
      else if (r.error === "signed_out") signedOut.current();
      else setErr(r.error === "forbidden" ? t("forbidden") : t("server"));
    });
    return () => { live = false; };
  }, [api, filters, t]);

  const setF = (patch: Partial<HistoryFilters>) => setFilters((f) => {
    const n = { ...f, ...patch };
    for (const k of Object.keys(n) as (keyof HistoryFilters)[]) if (!n[k]) delete n[k];
    return n;
  });
  const anyFilter = Object.keys(filters).length > 0;

  return (
    <>
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>{t("h_t")}</h1>
      <p className="muted">{t("h_sub")}</p>
      <div className="filters">
        <label>{t("f_person")}
          <select value={filters.person ?? ""} onChange={(e) => setF({ person: e.target.value })}>
            <option value="">{t("f_all")}</option>
            {data?.people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>{t("f_recipe")}
          <select value={filters.recipeId ?? ""} onChange={(e) => setF({ recipeId: e.target.value })}>
            <option value="">{t("f_all")}</option>
            {data?.recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label>{t("f_from")}<input type="date" value={filters.from ?? ""} onChange={(e) => setF({ from: e.target.value })} /></label>
        <label>{t("f_to")}<input type="date" value={filters.to ?? ""} onChange={(e) => setF({ to: e.target.value })} /></label>
      </div>
      {anyFilter && <button type="button" className="linkbtn" style={{ marginBottom: 8 }} onClick={() => setFilters({})}>{t("f_clear")}</button>}
      {err && <p className="err">{err}</p>}
      {!data ? <p className="muted">{t("loading")}</p> : data.rows.length === 0 ? (
        <div className="demo">{anyFilter ? t("h_none_match") : t("h_empty")}</div>
      ) : (
        <div className="hlist">
          {data.rows.map((e) => (
            <button key={e.id} type="button" className="hrow" onClick={() => onOpen(e.id)}>
              <b>{e.recipeName}</b>{actionTag(e.action, t)}
              <span className="s">{e.by} · {when(e.at, lang)} · {e.source === "admin" ? t("src_admin") : t("src_staff")}</span>
              <span className="s">{e.summary}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// One side of the before / after view. Lines that differ from the other side are highlighted.
function SnapshotLines({ s, other, t, lang, photoUrl, onZoom }: { s: Snapshot | null; other: Snapshot | null; t: T; lang: Lang; photoUrl: string | null; onZoom: (src: string) => void }) {
  if (!s) return <div className="ln muted">—</div>;
  const lines: { key: string; text: string; changed: boolean }[] = [];
  const add = (key: string, text: string, changed: boolean) => lines.push({ key, text, changed });
  const triLines = (label: string, a: Tri | null, b: Tri | null | undefined) => {
    add(label, `${label}: ${pick(a, lang) || "—"}`, (a?.[lang] ?? a?.en ?? "") !== (b?.[lang] ?? b?.en ?? ""));
    for (const l of ["en", "tr", "es"] as Lang[]) {
      if (l !== lang && (a?.[l] ?? "") !== (b?.[l] ?? "")) add(`${label}-${l}`, `${label} (${l.toUpperCase()}): ${a?.[l] || "—"}`, true);
    }
  };
  add("name", s.name, !!other && other.name !== s.name);
  if (other && !s.active) add("active", t("act_archive"), other.active !== s.active);
  s.ingredients.forEach((g, i) => {
    const og = other?.ingredients[i];
    const amt = g.qty !== null ? `${fmt(g.qty, 3)} ${g.unit === "dash" ? t("dashes") : g.unit ?? ""}` : pick(g.text, lang);
    const changed = !!other && (!og || JSON.stringify(og) !== JSON.stringify(g));
    add(`i${i}`, `${pick(g.name, lang)} ${amt}${s.mode === "portions" && !g.inBatch ? ` (${t("service").split(" (")[0].toLowerCase()})` : ""}`.trim(), changed);
  });
  triLines(t("glass"), s.glass, other?.glass);
  triLines(t("ice"), s.ice, other?.ice);
  triLines(t("garnish"), s.garnish, other?.garnish);
  triLines(t("howto"), s.howTo, other?.howTo);
  triLines(t("notes"), s.notes, other?.notes);
  add("storage", `${t("storage")}: ${s.storage ? t(s.storage) : "—"}`, !!other && other.storage !== s.storage);
  if (s.mode === "portions") {
    add("dp", `${t("usualb")}: ${s.defaultPortions ?? "—"}`, !!other && other.defaultPortions !== s.defaultPortions);
    add("dil", `${t("dilution")}: ${fmt(s.dilutionPct * 100, 1)}`, !!other && other.dilutionPct !== s.dilutionPct);
  }
  add("pour", `${t("pouroz")}: ${s.pourOz ?? "—"}`, !!other && other.pourOz !== s.pourOz);
  add("stores", `${t("stores")}: ${s.stores.map((x) => (x === "meyhouse" ? "Meyhouse" : "Meze Kebab")).join(", ")}`, !!other && [...other.stores].sort().join() !== [...s.stores].sort().join());
  const photoChanged = !!other && other.photoPath !== s.photoPath;
  return (
    <>
      {photoUrl ? (
        <button type="button" onClick={() => onZoom(photoUrl)} style={{ border: 0, padding: 0, background: "none" }} aria-label={t("tapzoom")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="" style={photoChanged ? { outline: "3px solid var(--brass)" } : undefined} />
        </button>
      ) : photoChanged ? <div className="ln"><span className="chg">{t("nophoto")}</span></div> : null}
      {lines.map((l) => <div key={l.key} className="ln">{l.changed ? <span className="chg">{l.text}</span> : l.text}</div>)}
    </>
  );
}

function HistoryDetail({ api, id, t, lang, busy, onBack, onRevert, onZoom }: {
  api: BookApi; id: string; t: T; lang: Lang; busy: boolean; onBack: () => void; onRevert: (logId: string) => void; onZoom: (src: string) => void;
}) {
  const [entry, setEntry] = useState<HistoryEntry | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    api.entry(id).then((r) => {
      if (!live) return;
      if (r.ok) setEntry(r.entry);
      else setErr(r.error === "forbidden" ? t("forbidden") : t("server"));
    });
    return () => { live = false; };
  }, [api, id, t]);

  return (
    <>
      <button type="button" className="back" onClick={onBack}>‹ {t("h_t")}</button>
      {err && <p className="err">{err}</p>}
      {!entry ? (!err && <p className="muted">{t("loading")}</p>) : (
        <>
          <h1 style={{ fontSize: 26 }}>{entry.recipeName}{actionTag(entry.action, t)}</h1>
          <p className="muted" style={{ margin: "4px 0" }}>{entry.by} · {when(entry.at, lang)} · {entry.source === "admin" ? t("src_admin") : t("src_staff")}{entry.language ? ` · ${entry.language.toUpperCase()}` : ""}</p>
          <p style={{ margin: "4px 0" }}>{entry.summary}</p>
          <div className="diff">
            <div><h3>{t("before")}</h3><SnapshotLines s={entry.before} other={entry.after} t={t} lang={lang} photoUrl={entry.beforePhotoUrl} onZoom={onZoom} /></div>
            <div><h3>{t("after")}</h3><SnapshotLines s={entry.after} other={entry.before} t={t} lang={lang} photoUrl={entry.afterPhotoUrl} onZoom={onZoom} /></div>
          </div>
          <p className="muted" style={{ fontSize: 14, marginBottom: 8 }}>{t("revert_note")}</p>
          <button type="button" className="btn warn" disabled={busy} onClick={() => onRevert(entry.id)}>{t("revert")}</button>
        </>
      )}
    </>
  );
}

// ===========================================================================
// Who can see this (read-only; changed on the launcher Team page)
// ===========================================================================
function Access({ api, t }: { api: BookApi; t: T }) {
  const [data, setData] = useState<AccessOverview | null>(null);
  useEffect(() => {
    let live = true;
    api.access().then((r) => { if (live) setData(r); });
    return () => { live = false; };
  }, [api]);
  const positions = useMemo(() => (data && data.ok ? data.positions : []), [data]);
  return (
    <>
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>{t("a_t")}</h1>
      <p className="muted" style={{ marginBottom: 12 }}>{t("a_sub")}</p>
      {!data ? <p className="muted">{t("loading")}</p> : !data.ok ? <p className="err">{data.error === "forbidden" ? t("forbidden") : t("server")}</p> : (
        <div style={{ borderRadius: "var(--radius-sm)", overflow: "hidden", maxWidth: 640 }}>
          {positions.map((p) => (
            <div key={p.name} className="switch">
              <span><b>{p.name}</b><br /><span className="muted" style={{ fontSize: 13 }}>{p.people.join(", ") || t("a_nobody")}</span></span>
              <span className={p.enabled ? "tag batch" : "tag"}>{p.enabled ? t("a_on") : t("a_off")}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

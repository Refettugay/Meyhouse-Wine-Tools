"use client";

// Staff Recipe Book (phones first, tablets second): PIN sign-in, the
// first-time PIN and the "no access" screen live here; everything after sign-in
// is the shared Recipe Book (src/components/recipe-book/book.tsx), where every
// save asks for a PIN again.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  signIn, signOut, loadFeed, listPinless, createPin,
  saveRecipeWithPin, setActiveWithPin, revertWithPin, loadHistory, loadHistoryEntry, loadAccessOverview,
} from "./actions";
import { makeT } from "@/components/recipe-book/i18n";
import { Book } from "@/components/recipe-book/book";
import { LangSwitch, Logo, PinScreen, type T } from "@/components/recipe-book/ui";
import type { BookApi } from "@/components/recipe-book/api";
import type { FeedResult, Lang, RecipeFeed } from "@/lib/recipe-book/types";

type Stage = "loading" | "pin" | "setup" | "denied" | "app" | "message";

const LANG_KEY = "rb_lang";
const REFRESH_MS = 60_000;

function storageGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function storageSet(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch {}
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

  const api: BookApi = useMemo(() => ({
    needsPin: true,
    reload: async () => { const r = await loadFeed(token); lastLoad.current = Date.now(); return r; },
    save: (input, pin) => saveRecipeWithPin(token, pin ?? "", input),
    setActive: (id, active, pin) => setActiveWithPin(token, pin ?? "", id, active),
    revert: (logId, pin) => revertWithPin(token, pin ?? "", logId),
    history: (filters) => loadHistory(token, filters),
    entry: (id) => loadHistoryEntry(token, id),
    access: () => loadAccessOverview(token),
  }), [token]);

  async function handleSignOut() {
    await signOut(token);
    setFeed(null); setDenied(null); setMessage("");
    setStage("pin");
  }
  const signedOut = useCallback(() => { setFeed(null); setMessage("signed_out"); setStage("pin"); }, []);

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
  return <Book feed={feed} api={api} t={t} lang={lang} onLang={changeLang} onFeed={setFeed} onSignOut={handleSignOut} onSignedOut={signedOut} />;
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

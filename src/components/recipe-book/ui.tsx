"use client";

// Small shared pieces of the Recipe Book screens.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/recipe-book/types";
import type { makeT } from "./i18n";

export type T = ReturnType<typeof makeT>;

export function Logo() {
  // Same asset as the Tip Entry staff page (launcher public/tip-entry/meyhouse-logo.png).
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="logo" src="/bar/meyhouse-logo.png" alt="Meyhouse Management Group" width={600} height={194} />;
}

export function LangSwitch({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="lang" role="group" aria-label="Language">
      {(["en", "tr", "es"] as Lang[]).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => onChange(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

export function GlassIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M5 4h14l-7 8z" /><path d="M12 12v7M8 20h8" />
    </svg>
  );
}

// 4-digit PIN pad. `onPin` returns an error to show (the pad shakes and clears)
// or null. Digits and Backspace on a hardware keyboard work too.
export function PinScreen({ t, lang, onLang, notice, onPin, title, sub, footer, onBack, header = true }: {
  t: T; lang: Lang; onLang: (l: Lang) => void; notice: string;
  onPin: (pin: string) => Promise<string | null>;
  title?: string; sub?: string; footer?: React.ReactNode; onBack?: () => void;
  header?: boolean; // logo + language switch (off inside the save sheet)
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("del");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  return (
    <div className="pin">
      {header && <div className="pinlang"><LangSwitch lang={lang} onChange={onLang} /></div>}
      {header && <Logo />}
      {header && <div className="sublogo" style={{ marginBottom: 18 }}>{t("bar")}</div>}
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

"use client";

// The Recipe Book inside Beverage admin (owners + managers). Same screens as the
// staff page; saves are stamped with the signed-in account instead of a PIN.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Book } from "@/components/recipe-book/book";
import { makeT } from "@/components/recipe-book/i18n";
import type { BookApi } from "@/components/recipe-book/api";
import type { Lang, RecipeFeed } from "@/lib/recipe-book/types";
import {
  loadFeedAdmin, saveRecipeAdmin, setActiveAdmin, revertAdmin, loadHistoryAdmin, loadHistoryEntryAdmin, loadAccessOverviewAdmin,
} from "@/lib/actions/bar-recipes";

const LANG_KEY = "rb_lang";

export function AdminBook() {
  const [lang, setLang] = useState<Lang>(() => {
    try { const l = localStorage.getItem(LANG_KEY); if (l === "en" || l === "tr" || l === "es") return l; } catch {}
    return "en";
  });
  const t = useMemo(() => makeT(lang), [lang]);
  const [feed, setFeed] = useState<RecipeFeed | null>(null);
  const [err, setErr] = useState("");

  const api: BookApi = useMemo(() => ({
    needsPin: false,
    reload: () => loadFeedAdmin(),
    save: (input) => saveRecipeAdmin(input),
    setActive: (id, active) => setActiveAdmin(id, active),
    revert: (logId) => revertAdmin(logId),
    history: (filters) => loadHistoryAdmin(filters),
    entry: (id) => loadHistoryEntryAdmin(id),
    access: () => loadAccessOverviewAdmin(),
  }), []);

  useEffect(() => {
    let live = true;
    loadFeedAdmin().then((r) => {
      if (!live) return;
      if (r.ok) setFeed(r.feed);
      else setErr(r.error === "signed_out" ? t("forbidden") : t("server"));
    });
    return () => { live = false; };
  }, [t]);

  const changeLang = (l: Lang) => { setLang(l); try { localStorage.setItem(LANG_KEY, l); } catch {} };
  const signedOut = useCallback(() => setErr(t("forbidden")), [t]);

  if (err) return <div className="wrap"><p className="err">{err}</p></div>;
  if (!feed) return <div className="wrap"><p className="muted">{t("loading")}</p></div>;
  return <Book feed={feed} api={api} t={t} lang={lang} onLang={changeLang} onFeed={setFeed} onSignedOut={signedOut} />;
}

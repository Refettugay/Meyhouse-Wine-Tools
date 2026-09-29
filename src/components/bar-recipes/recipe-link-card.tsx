"use client";

// The ONE staff Recipe Book link for the whole group: create, copy, turn on/off,
// make a new one. Same look and wording as the Staff count links drawer.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { rotateRecipeLink, setRecipeLinkEnabled } from "@/lib/actions/bar-recipes";

export function RecipeLinkCard({ link }: { link: { token: string; enabled: boolean; since: string } | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = link ? `${origin}/bar/${link.token}` : "";

  async function run(fn: () => Promise<{ error: string } | { success: true }>, done?: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await fn();
      if ("error" in r) setError(r.error);
      else { if (done) setNotice(done); router.refresh(); }
    } catch {
      setError("Couldn't reach the server. Refresh the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-[var(--line)] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--brand-brown)]">Staff link (all stores)</h2>
          <p className="text-xs text-[var(--ink-muted)]">Staff open it on a phone or tablet and sign in with their PIN. The store tabs inside separate Meyhouse and Meze Kebab.</p>
        </div>
        {link && (
          <label className="flex items-center gap-2 text-xs shrink-0">
            <input type="checkbox" checked={link.enabled} disabled={busy} onChange={(e) => run(() => setRecipeLinkEnabled(e.target.checked))} className="accent-[var(--brand-olive)]" />
            {link.enabled ? "On" : "Off"}
          </label>
        )}
      </div>
      {error && <p className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2">{error}</p>}
      {notice && !error && <p className="text-xs bg-green-50 border border-green-200 text-green-800 rounded-lg px-3 py-2">{notice}</p>}
      {link ? (
        <>
          <div className="flex gap-2">
            <input readOnly value={url} className={`flex-1 min-w-0 px-2 py-1.5 text-xs border border-[var(--line)] rounded-lg bg-[var(--brand-cream)] ${link.enabled ? "" : "line-through opacity-60"}`} />
            <button
              onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}
              className="px-3 py-1.5 rounded-full bg-[var(--brand-olive)] text-white text-xs font-medium"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <a href={url} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-full border border-[var(--line)] text-xs font-medium text-[var(--brand-brown)]">Open</a>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--ink-muted)]">Since {new Date(link.since).toLocaleDateString()}</span>
            {!confirm && (
              <button disabled={busy} onClick={() => { setConfirm(true); setError(null); setNotice(null); }} className="px-3 py-1.5 rounded-full border border-[var(--line)] text-xs font-medium text-[var(--brand-brown)] disabled:opacity-50">
                Make a new link
              </button>
            )}
          </div>
          {confirm && (
            <div className="rounded-lg border border-[#D4A017] bg-[#FFF8E1] p-2 text-xs text-[#8A6A00] space-y-2">
              <p>The current link stops working right away and anyone signed in on it is signed out. Staff will need the new link.</p>
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={async () => { await run(rotateRecipeLink, "New link made. Copy it and share it with staff."); setConfirm(false); }}
                  className="px-3 py-1.5 rounded-full bg-[var(--brand-olive)] text-white font-medium disabled:opacity-50"
                >
                  {busy ? "Making…" : "Yes, make a new link"}
                </button>
                <button onClick={() => setConfirm(false)} className="px-3 py-1.5 rounded-full border border-[var(--line)] bg-white">Cancel</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <button disabled={busy} onClick={() => run(rotateRecipeLink, "Link made. Copy it and share it with staff.")} className="px-3 py-1.5 rounded-full bg-[var(--brand-cream)] border border-[var(--line)] text-xs font-medium disabled:opacity-50">
          Create link
        </button>
      )}
    </div>
  );
}

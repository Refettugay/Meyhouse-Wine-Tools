"use client";

// Staff count links (one secret link per store): create, copy, turn on/off,
// rotate. Only stores this person may manage are listed.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { rotateCountLink, setCountLinkEnabled } from "@/lib/actions/ordering";

export type CountLinkInfo = { token: string; enabled: boolean; since: string };

export function StaffLinksDrawer({
  open,
  onClose,
  stores,
  links,
}: {
  open: boolean;
  onClose: () => void;
  stores: { id: string; name: string }[];
  links: Record<string, CountLinkInfo>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState<string | null>(null); // store id asking "are you sure?"
  const [notice, setNotice] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  async function run(id: string, fn: () => Promise<{ error?: string } | { success: boolean }>) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      if ("error" in r && r.error) setError(r.error);
      else router.refresh();
    } catch {
      setError("Couldn't reach the server. Refresh the page and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden="true" />}
      <div
        className={`fixed top-0 right-0 h-screen w-[440px] max-w-[92vw] bg-white border-l border-[var(--line)] shadow-xl z-50 flex flex-col transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
        role="dialog"
        aria-label="Staff count links"
        aria-hidden={!open}
      >
        <div className="p-4 border-b border-[var(--line)] flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-[var(--brand-brown)]">Staff count links</h2>
            <p className="text-xs text-[var(--ink-muted)]">Staff open their store&rsquo;s link on a phone and sign in with name + PIN.</p>
          </div>
          <button onClick={onClose} className="text-[var(--ink-muted)] text-lg" aria-label="Close">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && <p className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2">{error}</p>}
          {notice && !error && <p className="text-xs bg-green-50 border border-green-200 text-green-800 rounded-lg px-3 py-2">{notice}</p>}
          {stores.length === 0 && <p className="text-sm text-[var(--ink-muted)]">You don&rsquo;t manage any store&rsquo;s link.</p>}
          {stores.map((s) => {
            const link = links[s.id];
            const url = link ? `${origin}/count/${link.token}` : "";
            return (
              <div key={s.id} className="border border-[var(--line)] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-[var(--brand-brown)]">{s.name.replace("Meyhouse ", "")}</span>
                  {link ? (
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={link.enabled}
                        disabled={busy === s.id}
                        onChange={(e) => run(s.id, () => setCountLinkEnabled(s.id, e.target.checked))}
                        className="accent-[var(--brand-olive)]"
                      />
                      {link.enabled ? "On" : "Off"}
                    </label>
                  ) : (
                    <span className="text-xs text-[var(--ink-muted)]">No link yet</span>
                  )}
                </div>
                {link ? (
                  <>
                    <div className="flex gap-2">
                      <input readOnly value={url} className={`flex-1 min-w-0 px-2 py-1.5 text-xs border border-[var(--line)] rounded-lg bg-[var(--brand-cream)] ${link.enabled ? "" : "line-through opacity-60"}`} />
                      <button
                        onClick={async () => {
                          try { await navigator.clipboard.writeText(url); setCopied(s.id); setTimeout(() => setCopied(null), 1500); } catch {}
                        }}
                        className="px-3 py-1.5 rounded-full bg-[var(--brand-olive)] text-white text-xs font-medium"
                      >
                        {copied === s.id ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[var(--ink-muted)]">Since {new Date(link.since).toLocaleDateString()}</span>
                      {confirmRotate !== s.id && (
                        <button
                          disabled={busy === s.id}
                          onClick={() => { setConfirmRotate(s.id); setError(null); setNotice(null); }}
                          className="px-3 py-1.5 rounded-full border border-[var(--line)] text-xs font-medium text-[var(--brand-brown)] disabled:opacity-50"
                        >
                          Make a new link
                        </button>
                      )}
                    </div>
                    {confirmRotate === s.id && (
                      <div className="rounded-lg border border-[#D4A017] bg-[#FFF8E1] p-2 text-xs text-[#8A6A00] space-y-2">
                        <p>The current link stops working right away and anyone signed in on it is signed out. Staff will need the new link.</p>
                        <div className="flex gap-2">
                          <button
                            disabled={busy === s.id}
                            onClick={async () => {
                              await run(s.id, () => rotateCountLink(s.id));
                              setConfirmRotate(null);
                              setNotice(`New link made for ${s.name.replace("Meyhouse ", "")}. Copy it and share it with staff.`);
                            }}
                            className="px-3 py-1.5 rounded-full bg-[var(--brand-olive)] text-white font-medium disabled:opacity-50"
                          >
                            {busy === s.id ? "Making…" : "Yes, make a new link"}
                          </button>
                          <button onClick={() => setConfirmRotate(null)} className="px-3 py-1.5 rounded-full border border-[var(--line)] bg-white">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    disabled={busy === s.id}
                    onClick={() => run(s.id, () => rotateCountLink(s.id))}
                    className="px-3 py-1.5 rounded-full bg-[var(--brand-cream)] border border-[var(--line)] text-xs font-medium disabled:opacity-50"
                  >
                    Create link
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

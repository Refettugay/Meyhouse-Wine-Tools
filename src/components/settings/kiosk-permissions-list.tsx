"use client";

import { useState } from "react";
import { setCanMark86, type KioskPersonRow } from "@/lib/actions/kiosk-permissions";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", supervisor: "Supervisor", staff: "Staff" };

export function KioskPermissionsList({ people, canEdit }: { people: KioskPersonRow[]; canEdit: boolean }) {
  const [rows, setRows] = useState(people);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(p: KioskPersonRow) {
    const next = !p.canMark86;
    setBusy(p.personId);
    setError(null);
    try {
      const r = await setCanMark86(p.personId, next);
      if (r.ok) setRows((rs) => rs.map((x) => (x.personId === p.personId ? { ...x, canMark86: next, isDefault: false } : x)));
      else setError(r.error);
    } catch {
      setError("Couldn't save. Check the connection and try again.");
    }
    setBusy(null);
  }

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--ink-muted)]">Nobody has staff ordering switched on yet.</p>;
  }

  return (
    <div className="space-y-2">
      {!canEdit && <p className="text-xs text-[var(--ink-muted)]">Only owners and managers can change these.</p>}
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      <div className="bg-white border border-[var(--line)] rounded-xl divide-y divide-[var(--line)]">
        {rows.map((p) => (
          <div key={p.personId} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--brand-brown)] truncate">{p.name}</p>
              <p className="text-xs text-[var(--ink-muted)] truncate">
                {ROLE_LABEL[p.role] ?? p.role} · {p.stores.join(", ") || "—"}
                {p.isDefault && " · default"}
              </p>
            </div>
            <label className="flex items-center gap-2 shrink-0 text-xs text-[var(--brand-brown)]">
              <span>Can mark 86</span>
              <button
                type="button"
                role="switch"
                aria-checked={p.canMark86}
                aria-label={`Can mark 86: ${p.name}`}
                disabled={!canEdit || busy === p.personId}
                onClick={() => toggle(p)}
                className={`relative w-10 h-6 rounded-full transition-colors disabled:opacity-50 ${p.canMark86 ? "bg-[var(--brand-olive)]" : "bg-[var(--line)]"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${p.canMark86 ? "translate-x-4" : ""}`} />
              </button>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

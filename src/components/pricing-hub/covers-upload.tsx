"use client";

import { useState, useTransition } from "react";
import {
  previewCoversUpload,
  saveCoversSnapshot,
  deleteCoverSnapshot,
  type CoversPreview,
} from "@/lib/actions/covers-upload";
import { Upload, FileText, Check, AlertTriangle, Trash2 } from "lucide-react";

interface Location {
  id: string;
  name: string;
}

interface Snapshot {
  id: string;
  locationId: string | null;
  periodStart: Date;
  periodEnd: Date;
  totalCovers: number;
  totalReservations: number;
  sourceFilename: string | null;
  createdAt: Date;
  location: Location | null;
}

interface Props {
  locations: Location[];
  snapshots: Snapshot[];
}

function formatDate(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

export function CoversUploadUi({ locations, snapshots: initialSnapshots }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>(initialSnapshots);
  const [locationId, setLocationId] = useState<string>(locations[0]?.id ?? "");
  const [sourceFilename, setSourceFilename] = useState<string | null>(null);
  const [preview, setPreview] = useState<CoversPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSourceFilename(file.name);
    const text = await file.text();
    startTransition(async () => {
      try {
        const result = await previewCoversUpload(text, locationId || null);
        setPreview(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse CSV");
      }
    });
  }

  function doSave(replaceExisting: boolean) {
    if (!preview) return;
    startTransition(async () => {
      const res = await saveCoversSnapshot(
        preview.locationId,
        preview.periodStart,
        preview.periodEnd,
        sourceFilename,
        preview.days,
        replaceExisting
      );

      if ("duplicate" in res && res.duplicate) {
        const when = res.existingCreatedAt
          ? new Date(res.existingCreatedAt).toLocaleDateString()
          : "earlier";
        const ok = window.confirm(
          `A covers snapshot for this location and period was already uploaded (${when}).\n\n` +
            `Saving again would double-count these covers. Do you want to REPLACE the existing one instead?`
        );
        if (ok) doSave(true);
        return;
      }

      if ("success" in res && res.success) {
        setPreview(null);
        setSourceFilename(null);
        window.location.reload();
      } else {
        setError("error" in res && res.error ? res.error : "Save failed");
      }
    });
  }

  function saveToDb() {
    doSave(false);
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this covers snapshot? Its data will be lost.")) return;
    startTransition(async () => {
      await deleteCoverSnapshot(id);
      setSnapshots((prev) => prev.filter((s) => s.id !== id));
    });
  }

  // last 10 days of the preview for a quick sanity glance
  const recentDays = preview
    ? Object.values(
        preview.days.reduce<Record<string, { date: string; lunch: number; dinner: number }>>(
          (acc, d) => {
            const row = acc[d.date] ?? { date: d.date, lunch: 0, dinner: 0 };
            if (d.service === "lunch") row.lunch += d.covers;
            else row.dinner += d.covers;
            acc[d.date] = row;
            return acc;
          },
          {}
        )
      )
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10)
    : [];

  return (
    <div className="space-y-6">
      {/* Upload card */}
      <section className="bg-white border border-[var(--line)] rounded-xl p-5">
        <h2 className="font-semibold text-[var(--brand-brown)] mb-1 flex items-center gap-2">
          <Upload className="w-4 h-4 text-[var(--brand-olive)]" />
          Upload OpenTable Covers CSV
        </h2>
        <p className="text-xs text-[var(--ink-muted)] mb-4">
          In OpenTable, go to Reporting → Reservations → Export. The report is emailed to you as a
          CSV; upload that file here. Only guest counts are read — names and phone numbers are ignored.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-[var(--ink-muted)] mb-1">Location</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full px-3 py-1.5 border border-[var(--line)] rounded-lg text-sm"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-[var(--ink-muted)] mt-1">
              The date range is read automatically from the file.
            </p>
          </div>
        </div>

        <div className="border-2 border-dashed border-[var(--line)] rounded-lg p-6 text-center hover:border-[var(--brand-olive)] transition-colors">
          <input
            type="file"
            id="covers-upload"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          <label
            htmlFor="covers-upload"
            className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium"
          >
            <Upload className="w-4 h-4" />
            Select OpenTable CSV
          </label>
        </div>

        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}
        {isPending && !preview && (
          <p className="mt-3 text-sm text-[var(--ink-muted)]">Reading CSV…</p>
        )}
      </section>

      {/* Preview */}
      {preview && (
        <section className="bg-white border border-[var(--brand-olive)] rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-semibold text-[var(--brand-brown)] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--brand-olive)]" />
                Preview — not yet saved
              </h2>
              <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                {preview.locationName ?? "All locations"} · {preview.periodStart} to {preview.periodEnd}
                {sourceFilename && <> · {sourceFilename}</>}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setPreview(null);
                  setSourceFilename(null);
                }}
                className="px-3 py-1.5 border border-[var(--line)] text-[var(--ink-muted)] rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                onClick={saveToDb}
                disabled={isPending}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                Save snapshot
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Total covers" value={preview.totalCovers.toLocaleString()} />
            <Stat label="Lunch" value={preview.lunchCovers.toLocaleString()} />
            <Stat label="Dinner" value={preview.dinnerCovers.toLocaleString()} />
            <Stat label="Days" value={preview.dayCount.toString()} />
          </div>
          {preview.excludedRows > 0 && (
            <p className="text-xs text-[var(--ink-muted)]">
              {preview.excludedRows} rows excluded (upcoming or unconfirmed reservations that hadn&apos;t
              happened yet).
            </p>
          )}

          <div>
            <h3 className="text-sm font-semibold text-[var(--brand-brown)] mb-2">
              Most recent days
            </h3>
            <div className="bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-[var(--ink-muted)] uppercase sticky top-0 bg-[var(--brand-cream)]">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-right">Lunch</th>
                    <th className="px-3 py-2 text-right">Dinner</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {recentDays.map((d) => (
                    <tr key={d.date}>
                      <td className="px-3 py-1.5 text-[var(--brand-brown)]">{d.date}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{d.lunch}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{d.dinner}</td>
                      <td className="px-3 py-1.5 text-right font-mono font-semibold">
                        {d.lunch + d.dinner}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* History */}
      <section className="bg-white border border-[var(--line)] rounded-xl p-5">
        <h2 className="font-semibold text-[var(--brand-brown)] mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-[var(--brand-olive)]" />
          Past Uploads ({snapshots.length})
        </h2>
        {snapshots.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)] italic">
            No covers uploaded yet. Upload your first OpenTable export above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-[var(--ink-muted)] uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Location</th>
                  <th className="px-3 py-2 text-left">Period</th>
                  <th className="px-3 py-2 text-right">Covers</th>
                  <th className="px-3 py-2 text-right">Reservations</th>
                  <th className="px-3 py-2 text-left">Uploaded</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {snapshots.map((s) => (
                  <tr key={s.id} className="hover:bg-[var(--brand-cream)]">
                    <td className="px-3 py-2 font-medium">{s.location?.name ?? "All locations"}</td>
                    <td className="px-3 py-2 text-[var(--ink-muted)]">
                      {formatDate(s.periodStart)} → {formatDate(s.periodEnd)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {s.totalCovers.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {s.totalReservations.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-[var(--ink-muted)] text-xs">
                      {formatDate(s.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => onDelete(s.id)}
                        className="p-1 rounded hover:bg-red-50 text-[var(--ink-muted)] hover:text-red-500"
                        title="Delete snapshot"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[var(--brand-brown)]">
      <div className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-xl font-bold font-mono">{value}</div>
    </div>
  );
}

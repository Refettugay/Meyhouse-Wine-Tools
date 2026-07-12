"use client";

import { useState, useTransition } from "react";
import {
  previewUpload,
  saveSnapshot,
  deleteSnapshot,
  type UploadPreview,
  type UploadPreviewItem,
} from "@/lib/actions/sales-upload";
import {
  Upload,
  FileText,
  Check,
  X,
  AlertTriangle,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface Location {
  id: string;
  name: string;
}

interface Snapshot {
  id: string;
  locationId: string | null;
  periodStart: Date;
  periodEnd: Date;
  totalQtySold: number;
  totalNetCents: number;
  itemsMatched: number;
  itemsUnmatched: number;
  sourceFilename: string | null;
  createdAt: Date;
  location: Location | null;
}

interface Props {
  locations: Location[];
  snapshots: Snapshot[];
}

function formatCents(c: number): string {
  return `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(d: Date | string): string {
  const dd = new Date(d);
  return dd.toISOString().slice(0, 10);
}

export function SalesUploadUi({ locations, snapshots: initialSnapshots }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>(initialSnapshots);
  const [locationId, setLocationId] = useState<string>(locations[0]?.id ?? "");
  const [periodStart, setPeriodStart] = useState("2025-01-01");
  const [periodEnd, setPeriodEnd] = useState("2025-12-31");
  const [sourceFilename, setSourceFilename] = useState<string | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [showMatched, setShowMatched] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleFolderSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Find "All levels.csv" anywhere inside the selected folder
    let allLevels: File | null = null;
    const folderNames = new Set<string>();
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const rel: string =
        (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? f.name;
      const parts = rel.split("/");
      if (parts.length > 1) folderNames.add(parts[0]);
      if (/all\s*levels\.csv$/i.test(f.name)) {
        allLevels = f;
      }
    }

    if (!allLevels) {
      setError("Could not find 'All levels.csv' in the selected folder.");
      return;
    }

    setError(null);
    const text = await allLevels.text();
    const folderName = Array.from(folderNames)[0] ?? allLevels.name;
    setSourceFilename(folderName);

    startTransition(async () => {
      try {
        const result = await previewUpload(
          text,
          locationId || null,
          periodStart,
          periodEnd
        );
        setPreview(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse CSV");
      }
    });
  }

  function updateMatch(rowIdx: number, matchId: string | null, matchType: "ingredient" | "recipe" | null, matchName: string | null) {
    if (!preview) return;
    const items = [...preview.items];
    items[rowIdx] = {
      ...items[rowIdx],
      matchId,
      matchType,
      matchName,
      confidence: matchId ? 1 : null, // user-confirmed = 100%
    };
    const matched = items.filter((i) => i.matchId).length;
    setPreview({
      ...preview,
      items,
      matchedItems: matched,
      unmatchedItems: items.length - matched,
    });
  }

  function doSave(replaceExisting: boolean) {
    if (!preview) return;
    startTransition(async () => {
      const res = await saveSnapshot(
        preview.locationId,
        preview.periodStart,
        preview.periodEnd,
        sourceFilename,
        preview.items,
        preview.menuGroupSummary,
        replaceExisting
      );

      // Duplicate guard: same location + period already uploaded.
      if ("duplicate" in res && res.duplicate) {
        const when = res.existingCreatedAt
          ? new Date(res.existingCreatedAt).toLocaleDateString()
          : "earlier";
        const ok = window.confirm(
          `A sales snapshot for this location and period was already uploaded (${when}).\n\n` +
            `Saving again would double-count this period. Do you want to REPLACE the existing one instead?`
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
    if (!confirm("Delete this snapshot? Its sales data will be lost.")) return;
    startTransition(async () => {
      await deleteSnapshot(id);
      setSnapshots((prev) => prev.filter((s) => s.id !== id));
    });
  }

  const unmatchedItems = preview?.items.filter((i) => !i.matchId) ?? [];
  const matchedItems = preview?.items.filter((i) => i.matchId) ?? [];

  return (
    <div className="space-y-6">
      {/* Upload card */}
      <section className="bg-white border border-[var(--line)] rounded-xl p-5">
        <h2 className="font-semibold text-[var(--brand-brown)] mb-1 flex items-center gap-2">
          <Upload className="w-4 h-4 text-[var(--brand-olive)]" />
          Upload Toast Product Mix CSV
        </h2>
        <p className="text-xs text-[var(--ink-muted)] mb-4">
          Select the folder you exported from Toast (contains{" "}
          <code className="text-[11px] px-1 bg-[var(--brand-cream)] rounded">All levels.csv</code>
          ). Sales data will be tied to the selected location and date range.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
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
          </div>
          <div>
            <label className="block text-xs text-[var(--ink-muted)] mb-1">Period Start</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full px-3 py-1.5 border border-[var(--line)] rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--ink-muted)] mb-1">Period End</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full px-3 py-1.5 border border-[var(--line)] rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="border-2 border-dashed border-[var(--line)] rounded-lg p-6 text-center hover:border-[var(--brand-olive)] transition-colors">
          <input
            type="file"
            id="folder-upload"
            /* @ts-expect-error webkitdirectory is non-standard but supported */
            webkitdirectory="true"
            directory="true"
            multiple
            onChange={handleFolderSelect}
            className="hidden"
          />
          <label
            htmlFor="folder-upload"
            className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium"
          >
            <Upload className="w-4 h-4" />
            Select Toast PMIX folder
          </label>
          <p className="text-xs text-[var(--ink-muted)] mt-2">
            or drag-drop the folder here
          </p>
        </div>

        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {isPending && !preview && (
          <p className="mt-3 text-sm text-[var(--ink-muted)]">Parsing CSV…</p>
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
                {preview.locationName ?? "All locations"} ·{" "}
                {preview.periodStart} to {preview.periodEnd}
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
            <Stat label="Items" value={preview.totalItems.toString()} color="stone" />
            <Stat label="Matched" value={preview.matchedItems.toString()} color="emerald" />
            <Stat label="Unmatched" value={preview.unmatchedItems.toString()} color={preview.unmatchedItems > 0 ? "amber" : "stone"} />
            <Stat label="Total Net $" value={formatCents(preview.totalNetCents)} color="stone" />
          </div>

          {/* Unmatched section (prominent) */}
          {unmatchedItems.length > 0 && (
            <div className="bg-[#FAF7F1] border border-[var(--brand-olive)] rounded-lg">
              <button
                onClick={() => setShowUnmatched((x) => !x)}
                className="w-full px-4 py-3 flex items-center justify-between text-left"
              >
                <span className="font-semibold text-[var(--brand-olive-hover)] flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {unmatchedItems.length} unmatched items (click to review)
                </span>
                {showUnmatched ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showUnmatched && (
                <div className="border-t border-[var(--brand-olive)] max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[rgba(74,93,39,0.12)] text-xs text-[var(--brand-olive-hover)] uppercase sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Toast Item Name</th>
                        <th className="px-3 py-2 text-left">Menu Group</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Net $</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--brand-olive)]">
                      {unmatchedItems.map((it, idx) => {
                        const realIdx = preview.items.indexOf(it);
                        return (
                          <tr key={realIdx} className="hover:bg-[#FAF7F1]">
                            <td className="px-3 py-1.5 text-[var(--brand-brown)]">{it.rawName}</td>
                            <td className="px-3 py-1.5 text-[var(--ink-muted)] text-xs">
                              {it.menu} · {it.menuGroup}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">{it.qtySold.toFixed(0)}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{formatCents(it.netCents)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="px-3 py-2 text-xs text-[var(--brand-olive-hover)]/70 bg-[#FAF7F1] border-t border-[var(--brand-olive)]">
                    These items couldn&apos;t be automatically matched to your product database.
                    They&apos;ll still be saved (raw name only) and can be matched later.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Matched section (collapsed by default) */}
          {matchedItems.length > 0 && (
            <div className="bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg">
              <button
                onClick={() => setShowMatched((x) => !x)}
                className="w-full px-4 py-3 flex items-center justify-between text-left"
              >
                <span className="font-semibold text-[var(--brand-brown)] flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  {matchedItems.length} matched items
                </span>
                {showMatched ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showMatched && (
                <div className="border-t border-[var(--line)] max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--brand-cream)] text-xs text-[var(--ink-muted)] uppercase sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Toast Name</th>
                        <th className="px-3 py-2 text-left">Matched to</th>
                        <th className="px-3 py-2 text-right">Conf</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Net $</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {matchedItems.map((it) => (
                        <tr key={it.rawName + it.menuGroup} className="hover:bg-[var(--brand-cream)]">
                          <td className="px-3 py-1.5 text-[var(--ink-muted)]">{it.rawName}</td>
                          <td className="px-3 py-1.5 text-[var(--brand-brown)] font-medium">
                            {it.matchName}
                            <span className="text-[10px] ml-1 text-[var(--ink-muted)] uppercase">
                              {it.matchType}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs font-mono">
                            {it.confidence ? (it.confidence * 100).toFixed(0) + "%" : ""}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">{it.qtySold.toFixed(0)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{formatCents(it.netCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Menu group summary */}
          {preview.menuGroupSummary.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[var(--brand-brown)] mb-2">
                Menu Group Totals ({preview.menuGroupSummary.length} groups)
              </h3>
              <div className="bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-[var(--ink-muted)] uppercase sticky top-0 bg-[var(--brand-cream)]">
                    <tr>
                      <th className="px-3 py-2 text-left">Menu</th>
                      <th className="px-3 py-2 text-left">Group</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Net $</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {preview.menuGroupSummary.map((g) => (
                      <tr key={g.menu + g.menuGroup}>
                        <td className="px-3 py-1 text-[var(--ink-muted)] text-xs">{g.menu}</td>
                        <td className="px-3 py-1 text-[var(--brand-brown)] text-xs">{g.menuGroup}</td>
                        <td className="px-3 py-1 text-right font-mono text-xs">{g.qty.toFixed(0)}</td>
                        <td className="px-3 py-1 text-right font-mono text-xs">{formatCents(g.netCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* History — past uploads */}
      <section className="bg-white border border-[var(--line)] rounded-xl p-5">
        <h2 className="font-semibold text-[var(--brand-brown)] mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-[var(--brand-olive)]" />
          Past Uploads ({snapshots.length})
        </h2>
        {snapshots.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)] italic">
            No uploads yet. Upload your first Toast PMIX above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-[var(--ink-muted)] uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Location</th>
                  <th className="px-3 py-2 text-left">Period</th>
                  <th className="px-3 py-2 text-right">Items</th>
                  <th className="px-3 py-2 text-right">Matched</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Net $</th>
                  <th className="px-3 py-2 text-left">Uploaded</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {snapshots.map((s) => (
                  <tr key={s.id} className="hover:bg-[var(--brand-cream)]">
                    <td className="px-3 py-2 font-medium">
                      {s.location?.name ?? "All locations"}
                    </td>
                    <td className="px-3 py-2 text-[var(--ink-muted)]">
                      {formatDate(s.periodStart)} → {formatDate(s.periodEnd)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {s.itemsMatched + s.itemsUnmatched}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-emerald-700">{s.itemsMatched}</span>
                      {s.itemsUnmatched > 0 && (
                        <span className="text-[var(--brand-olive-hover)]"> / {s.itemsUnmatched} unmatched</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{s.totalQtySold.toFixed(0)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatCents(s.totalNetCents)}</td>
                    <td className="px-3 py-2 text-[var(--ink-muted)] text-xs">{formatDate(s.createdAt)}</td>
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

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "stone" | "emerald" | "amber";
}) {
  const styles = {
    stone: "bg-white border-[var(--line)] text-[var(--brand-brown)]",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
    amber: "bg-[#FAF7F1] border-[var(--brand-olive)] text-[var(--brand-olive-hover)]",
  }[color];
  return (
    <div className={`rounded-lg border px-3 py-2 ${styles}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-xl font-bold font-mono">{value}</div>
    </div>
  );
}

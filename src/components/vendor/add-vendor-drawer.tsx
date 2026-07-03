"use client";

import { useState, useEffect } from "react";
import { createVendor } from "@/lib/actions/vendors";
import { Truck } from "lucide-react";

/**
 * Right-side slide-over for creating a vendor without leaving the current
 * page. Mirrors the Order Cart drawer pattern (fixed, translate-x, olive
 * header). Opened from the "+ Add new vendor…" shortcut in vendor dropdowns.
 *
 * When `assignToLabel` is set the primary button reads "Create & assign" and
 * the caller wires `onCreated` to attach the new vendor to that product.
 */
export function AddVendorDrawer({
  open,
  onClose,
  onCreated,
  assignToLabel,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (vendor: { id: string; name: string }) => void;
  assignToLabel?: string | null;
}) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Reset the form each time the drawer is opened.
  useEffect(() => {
    if (open) {
      setName("");
      setNotes("");
      setError("");
      setSaving(false);
    }
  }, [open]);

  async function handleCreate() {
    setError("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    const result = await createVendor({
      name: name.trim(),
      notes: notes.trim() || undefined,
    });
    if (result?.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    if (result?.vendor) {
      onCreated({ id: result.vendor.id, name: result.vendor.name });
    }
    onClose();
  }

  return (
    <>
      {/* Dimmed backdrop — click to close. Above the cart drawer (z-50). */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-[60]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer stays mounted; slides in/out via transform. */}
      <div
        className={`fixed top-0 right-0 h-screen w-[360px] max-w-[90vw] bg-white border-l border-[var(--line)] shadow-xl flex flex-col z-[70] transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="Add new vendor"
        aria-hidden={!open}
      >
        <div className="p-4 border-b border-[var(--line)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-[var(--brand-olive)]" />
            <h2 className="font-bold">Add New Vendor</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--ink-muted)] hover:text-[var(--brand-brown)] text-lg"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs uppercase tracking-wide text-[var(--ink-muted)] mb-1.5">
              Vendor name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              autoFocus
              placeholder="e.g. Southern Glazers Wine & Spirits"
              className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-[var(--ink-muted)] mb-1.5">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Account #, ordering days…"
              className="w-full px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)] resize-none"
            />
          </div>

          {assignToLabel && (
            <div className="px-3 py-2.5 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-xs text-[var(--ink-muted)] leading-relaxed">
              Will be assigned to{" "}
              <span className="text-[var(--brand-brown)] font-medium">
                {assignToLabel}
              </span>{" "}
              on save. Add reps &amp; stores later in the Vendors tab.
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[var(--line)] flex gap-2">
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex-1 py-2.5 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive-hover)] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : assignToLabel ? "Create & assign" : "Create vendor"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-[var(--brand-cream)] text-[var(--ink-muted)] border border-[var(--line)] rounded-lg text-sm hover:text-[var(--brand-brown)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

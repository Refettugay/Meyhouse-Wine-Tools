"use client";

import { useState } from "react";
import {
  createVendor,
  deleteVendor,
  createVendorRep,
  updateVendorRep,
  deleteVendorRep,
} from "@/lib/actions/vendors";
import {
  Plus,
  Trash2,
  Truck,
  Mail,
  Phone,
  MapPin,
  ChevronDown,
  ChevronUp,
  User,
  X,
  Edit,
} from "lucide-react";

interface Location {
  id: string;
  name: string;
}

interface VendorRepData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  locations: {
    location: Location;
  }[];
}

interface VendorData {
  id: string;
  name: string;
  notes: string | null;
  reps: VendorRepData[];
  _count: { ingredients: number };
}

export function VendorsManager({
  vendors,
  locations,
}: {
  vendors: VendorData[];
  locations: Location[];
}) {
  const [newVendorName, setNewVendorName] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = vendors.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleAddVendor(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!newVendorName.trim()) return;
    const result = await createVendor({ name: newVendorName.trim() });
    if (result?.error) {
      setError(result.error);
    } else {
      setNewVendorName("");
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Add new vendor */}
      <div className="bg-white border border-[var(--line)] rounded-xl p-4">
        <h2 className="font-semibold mb-3">Add New Vendor</h2>
        <form onSubmit={handleAddVendor} className="flex gap-2">
          <input
            value={newVendorName}
            onChange={(e) => setNewVendorName(e.target.value)}
            placeholder="e.g. Southern Glazers Wine & Spirits"
            className="flex-1 px-3 py-2 bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
          />
          <button
            type="submit"
            className="flex items-center gap-1 px-4 py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </form>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder={`Search ${vendors.length} vendors...`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 bg-white border border-[var(--line)] rounded-lg text-[var(--brand-brown)] placeholder-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
      />

      {/* Vendor list */}
      <div className="space-y-2">
        {filtered.map((vendor) => (
          <div
            key={vendor.id}
            className="bg-white border border-[var(--line)] rounded-xl overflow-hidden"
          >
            <button
              onClick={() =>
                setExpanded(expanded === vendor.id ? null : vendor.id)
              }
              className="w-full p-4 flex items-center justify-between hover:bg-[var(--brand-cream)] transition-colors"
            >
              <div className="flex items-center gap-3 text-left">
                <Truck className="w-5 h-5 text-[var(--brand-olive)]" />
                <div>
                  <p className="font-semibold">{vendor.name}</p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    {vendor._count.ingredients} products · {vendor.reps.length}{" "}
                    {vendor.reps.length === 1 ? "rep" : "reps"}
                  </p>
                </div>
              </div>
              {expanded === vendor.id ? (
                <ChevronUp className="w-5 h-5 text-[var(--ink-muted)]" />
              ) : (
                <ChevronDown className="w-5 h-5 text-[var(--ink-muted)]" />
              )}
            </button>

            {expanded === vendor.id && (
              <VendorDetails
                vendor={vendor}
                locations={locations}
                onDelete={async () => {
                  if (
                    confirm(
                      `Delete "${vendor.name}"? Products will keep their product info but lose the vendor link.`
                    )
                  ) {
                    await deleteVendor(vendor.id);
                  }
                }}
              />
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-8 text-[var(--ink-muted)] text-sm">
            {vendors.length === 0
              ? "No vendors yet. Add your first one above."
              : "No vendors match your search."}
          </div>
        )}
      </div>
    </div>
  );
}

function VendorDetails({
  vendor,
  locations,
  onDelete,
}: {
  vendor: VendorData;
  locations: Location[];
  onDelete: () => void;
}) {
  const [addingRep, setAddingRep] = useState(false);
  const [editingRepId, setEditingRepId] = useState<string | null>(null);

  return (
    <div className="px-4 pb-4 border-t border-[var(--line)] pt-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--brand-brown)]">Representatives</h3>
        {!addingRep && (
          <button
            onClick={() => setAddingRep(true)}
            className="flex items-center gap-1 text-sm text-[var(--brand-olive)] hover:text-[var(--brand-olive-hover)]"
          >
            <Plus className="w-3 h-3" />
            Add Rep
          </button>
        )}
      </div>

      {/* Add rep form */}
      {addingRep && (
        <RepForm
          vendorId={vendor.id}
          locations={locations}
          onDone={() => setAddingRep(false)}
        />
      )}

      {/* Rep list */}
      <div className="space-y-2">
        {vendor.reps.map((rep) => (
          <div
            key={rep.id}
            className="bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg p-3"
          >
            {editingRepId === rep.id ? (
              <RepForm
                vendorId={vendor.id}
                locations={locations}
                rep={rep}
                onDone={() => setEditingRepId(null)}
              />
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4 text-[var(--ink-muted)]" />
                    <p className="font-medium">{rep.name}</p>
                  </div>
                  <div className="space-y-0.5 text-xs text-[var(--ink-muted)] ml-6">
                    {rep.email && (
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        <a href={`mailto:${rep.email}`} className="hover:text-[var(--brand-olive)]">
                          {rep.email}
                        </a>
                      </div>
                    )}
                    {rep.phone && (
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        <a href={`tel:${rep.phone}`} className="hover:text-[var(--brand-olive)]">
                          {rep.phone}
                        </a>
                      </div>
                    )}
                    <div className="flex items-center gap-1 flex-wrap">
                      <MapPin className="w-3 h-3" />
                      {rep.locations.length > 0 ? (
                        rep.locations.map((rl) => (
                          <span
                            key={rl.location.id}
                            className="inline-block bg-[rgba(74,93,39,0.12)] text-[var(--brand-olive-hover)] px-2 py-0.5 rounded text-xs"
                          >
                            {rl.location.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-[var(--ink-muted)]">No stores</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditingRepId(rep.id)}
                    className="p-1 text-[var(--ink-muted)] hover:text-[var(--brand-olive)]"
                  >
                    <Edit className="w-3 h-3" />
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`Delete rep "${rep.name}"?`)) {
                        await deleteVendorRep(rep.id);
                      }
                    }}
                    className="p-1 text-[var(--ink-muted)] hover:text-red-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {vendor.reps.length === 0 && !addingRep && (
          <p className="text-xs text-[var(--ink-muted)] italic">
            No representatives added yet
          </p>
        )}
      </div>

      {/* Delete vendor — clearly labeled and separated from rep controls
          so it can't be mistaken for a "delete rep" action. */}
      <div className="mt-4 pt-3 border-t border-[var(--line)] flex justify-end">
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete vendor
        </button>
      </div>
    </div>
  );
}

function RepForm({
  vendorId,
  locations,
  rep,
  onDone,
}: {
  vendorId: string;
  locations: Location[];
  rep?: VendorRepData;
  onDone: () => void;
}) {
  const [name, setName] = useState(rep?.name || "");
  const [email, setEmail] = useState(rep?.email || "");
  const [phone, setPhone] = useState(rep?.phone || "");
  const [selectedLocIds, setSelectedLocIds] = useState<Set<string>>(
    new Set(rep?.locations.map((l) => l.location.id) || [])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleLocation(id: string) {
    const newSet = new Set(selectedLocIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedLocIds(newSet);
  }

  async function handleSave() {
    setError("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    const data = {
      name,
      email: email || undefined,
      phone: phone || undefined,
      locationIds: [...selectedLocIds],
    };
    const result = rep
      ? await updateVendorRep(rep.id, data)
      : await createVendorRep({ vendorId, ...data });
    if (result?.error) {
      setError(result.error);
      setSaving(false);
    } else {
      onDone();
    }
  }

  return (
    <div className="bg-white border border-[var(--brand-olive)] rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-[var(--brand-olive-hover)]">
          {rep ? "Edit Representative" : "New Representative"}
        </h4>
        <button onClick={onDone} className="text-[var(--ink-muted)] hover:text-[var(--brand-brown)]">
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-2 py-1.5 rounded text-xs mb-2">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rep Name *"
          className="w-full px-2 py-1.5 bg-[var(--brand-cream)] border border-[var(--line)] rounded text-[var(--brand-brown)] placeholder-[var(--ink-muted)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand-olive)]"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="w-full px-2 py-1.5 bg-[var(--brand-cream)] border border-[var(--line)] rounded text-[var(--brand-brown)] placeholder-[var(--ink-muted)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand-olive)]"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number"
            className="w-full px-2 py-1.5 bg-[var(--brand-cream)] border border-[var(--line)] rounded text-[var(--brand-brown)] placeholder-[var(--ink-muted)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand-olive)]"
          />
        </div>

        <div>
          <p className="text-xs text-[var(--ink-muted)] mb-1">Assigned to stores:</p>
          <div className="flex flex-wrap gap-1">
            {locations.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => toggleLocation(loc.id)}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  selectedLocIds.has(loc.id)
                    ? "bg-[var(--brand-olive)] text-white"
                    : "bg-[var(--brand-cream)] text-[var(--brand-brown)] hover:bg-[var(--line)]"
                }`}
              >
                {loc.name}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 bg-[var(--brand-olive)] hover:bg-[var(--brand-olive)] text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : rep ? "Update Rep" : "Add Rep"}
        </button>
      </div>
    </div>
  );
}

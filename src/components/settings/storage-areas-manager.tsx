"use client";

import { useState } from "react";
import { createStorageArea, renameStorageArea, deleteStorageArea, renameLocation } from "@/lib/actions/inventory";
import { Plus, Trash2, MapPin, Check, X } from "lucide-react";

interface AreaData {
  id: string;
  name: string;
  productCount: number;
  valueCents: number;
}

interface LocationData {
  id: string;
  name: string;
  storageAreas: AreaData[];
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function StorageAreasManager({ locations }: { locations: LocationData[] }) {
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleAdd(locationId: string) {
    setError(""); setSuccess("");
    if (!newName.trim()) return;
    const result = await createStorageArea(locationId, newName.trim());
    if (result?.error) { setError(result.error); return; }
    setSuccess(`Added "${newName.trim()}"`);
    setAddingFor(null);
    setNewName("");
  }

  async function handleRenameArea(id: string, oldName: string) {
    setError(""); setSuccess("");
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === oldName) { setEditingAreaId(null); return; }
    const result = await renameStorageArea(id, trimmed);
    if (result?.error) { setError(result.error); return; }
    setSuccess(`Renamed "${oldName}" → "${trimmed}"`);
    setEditingAreaId(null);
  }

  async function handleRenameLocation(id: string, oldName: string) {
    setError(""); setSuccess("");
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === oldName) { setEditingLocationId(null); return; }
    const result = await renameLocation(id, trimmed);
    if (result?.error) { setError(result.error); return; }
    setSuccess(`Renamed "${oldName}" → "${trimmed}"`);
    setEditingLocationId(null);
  }

  async function handleDelete(id: string, name: string, productCount: number) {
    setError(""); setSuccess("");
    if (productCount > 0) {
      if (!confirm(`Delete "${name}"? ${productCount} product(s) will lose this area assignment.`)) return;
    } else if (!confirm(`Delete "${name}"?`)) {
      return;
    }
    await deleteStorageArea(id);
    setSuccess(`Deleted "${name}"`);
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>
      )}

      {locations.map((loc) => {
        const locTotal = loc.storageAreas.reduce((sum, sa) => sum + sa.valueCents, 0);
        return (
        <div key={loc.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          {/* Location header */}
          <div className="px-4 py-3 bg-stone-50 border-b border-stone-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <MapPin className="w-4 h-4 text-amber-600 flex-shrink-0" />
              {editingLocationId === loc.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameLocation(loc.id, loc.name);
                      if (e.key === "Escape") setEditingLocationId(null);
                    }}
                    className="flex-1 px-2 py-1 bg-amber-50 border border-amber-300 rounded text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
                    autoFocus
                  />
                  <button onClick={() => handleRenameLocation(loc.id, loc.name)} className="p-1 text-green-600 hover:text-green-700" title="Save">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingLocationId(null)} className="p-1 text-stone-400 hover:text-stone-700" title="Cancel">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="font-semibold text-sm hover:text-amber-600 transition-colors"
                    onClick={() => { setEditingLocationId(loc.id); setEditValue(loc.name); setError(""); setSuccess(""); }}
                    title="Click to rename"
                  >
                    {loc.name}
                  </button>
                  <span className="text-xs text-stone-400">
                    ({loc.storageAreas.length} {loc.storageAreas.length === 1 ? "area" : "areas"})
                  </span>
                </>
              )}
            </div>
            {locTotal > 0 && (
              <span className="text-xs text-stone-500 whitespace-nowrap">
                Total: <span className="font-semibold text-amber-700">{formatCents(locTotal)}</span>
              </span>
            )}
          </div>

          {/* Areas list */}
          <div className="divide-y divide-stone-100">
            {loc.storageAreas.length === 0 ? (
              <div className="px-4 py-3 text-sm text-stone-400 italic">No storage areas yet</div>
            ) : (
              loc.storageAreas.map((sa) => (
                <div key={sa.id} className="px-4 py-2.5 flex items-center justify-between hover:bg-stone-50 group">
                  {editingAreaId === sa.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameArea(sa.id, sa.name);
                          if (e.key === "Escape") setEditingAreaId(null);
                        }}
                        className="flex-1 px-2 py-1 bg-amber-50 border border-amber-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                        autoFocus
                      />
                      <button onClick={() => handleRenameArea(sa.id, sa.name)} className="p-1 text-green-600 hover:text-green-700" title="Save">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingAreaId(null)} className="p-1 text-stone-400 hover:text-stone-700" title="Cancel">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <button
                          className="text-sm font-medium text-stone-800 hover:text-amber-600 transition-colors text-left"
                          onClick={() => { setEditingAreaId(sa.id); setEditValue(sa.name); setError(""); setSuccess(""); }}
                          title="Click to rename"
                        >
                          {sa.name}
                        </button>
                        <span className="text-xs text-stone-400">
                          ({sa.productCount} {sa.productCount === 1 ? "product" : "products"})
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {sa.valueCents > 0 ? (
                          <span className="text-xs font-semibold text-amber-700 whitespace-nowrap">
                            {formatCents(sa.valueCents)}
                          </span>
                        ) : (
                          <span className="text-xs text-stone-300">—</span>
                        )}
                        <button
                          onClick={() => handleDelete(sa.id, sa.name, sa.productCount)}
                          className="p-1 text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}

            {/* Add new */}
            <div className="px-4 py-2.5">
              {addingFor === loc.id ? (
                <div className="flex items-center gap-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={`New area for ${loc.name}...`}
                    autoFocus
                    className="flex-1 px-3 py-1.5 text-sm border border-stone-300 rounded-lg bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAdd(loc.id);
                      if (e.key === "Escape") { setAddingFor(null); setNewName(""); }
                    }}
                  />
                  <button onClick={() => handleAdd(loc.id)} className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium">Add</button>
                  <button onClick={() => { setAddingFor(null); setNewName(""); }} className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => { setAddingFor(loc.id); setNewName(""); setError(""); }}
                  className="flex items-center gap-1 text-xs text-stone-400 hover:text-amber-600 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add storage area
                </button>
              )}
            </div>
          </div>
        </div>
        );
      })}

      {/* Note about inventory */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
        <strong>Note:</strong> Values are calculated as (current stock × bottle cost) for all products assigned to that area. Once inventory counting is fully active, these values will reflect real-time stock levels.
      </div>
    </div>
  );
}

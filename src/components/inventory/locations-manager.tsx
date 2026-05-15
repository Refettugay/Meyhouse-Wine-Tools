"use client";

import { useState } from "react";
import {
  createLocation,
  deleteLocation,
  createStorageArea,
  deleteStorageArea,
} from "@/lib/actions/inventory";
import { Plus, Trash2, MapPin } from "lucide-react";

interface LocationWithAreas {
  id: string;
  name: string;
  storageAreas: { id: string; name: string }[];
  _count: { inventoryItems: number };
}

export function LocationsManager({
  locations,
}: {
  locations: LocationWithAreas[];
}) {
  const [newLocName, setNewLocName] = useState("");
  const [newAreaByLoc, setNewAreaByLoc] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function handleAddLocation(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!newLocName.trim()) return;

    const fd = new FormData();
    fd.set("name", newLocName.trim());
    const result = await createLocation(fd);
    if (result?.error) {
      setError(result.error);
    } else {
      setNewLocName("");
    }
  }

  async function handleAddArea(locId: string) {
    const name = newAreaByLoc[locId]?.trim();
    if (!name) return;
    const result = await createStorageArea(locId, name);
    if (result?.error) {
      setError(result.error);
    } else {
      setNewAreaByLoc({ ...newAreaByLoc, [locId]: "" });
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Add new location */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h2 className="font-semibold mb-3">Add New Location</h2>
        <form onSubmit={handleAddLocation} className="flex gap-2">
          <input
            value={newLocName}
            onChange={(e) => setNewLocName(e.target.value)}
            placeholder="e.g. Meyhouse Palo Alto"
            className="flex-1 px-3 py-2 bg-stone-100 border border-stone-300 rounded-lg text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <button
            type="submit"
            className="flex items-center gap-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </form>
      </div>

      {/* Existing locations */}
      {locations.map((loc) => (
        <div
          key={loc.id}
          className="bg-white border border-stone-200 rounded-xl overflow-hidden"
        >
          <div className="p-4 border-b border-stone-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold">{loc.name}</h3>
              <span className="text-xs text-stone-500 ml-2">
                ({loc._count.inventoryItems} items)
              </span>
            </div>
            <button
              onClick={async () => {
                if (
                  confirm(
                    `Delete "${loc.name}"? This will remove all inventory items and storage areas for this location.`
                  )
                ) {
                  await deleteLocation(loc.id);
                }
              }}
              className="p-2 text-stone-500 hover:text-red-600 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4">
            <p className="text-xs text-stone-500 mb-2">Storage Areas</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {loc.storageAreas.map((area) => (
                <div
                  key={area.id}
                  className="flex items-center gap-1 bg-stone-100 rounded-full pl-3 pr-1 py-1 text-sm"
                >
                  <span>{area.name}</span>
                  <button
                    onClick={async () => {
                      if (confirm(`Delete storage area "${area.name}"?`)) {
                        await deleteStorageArea(area.id);
                      }
                    }}
                    className="p-1 text-stone-500 hover:text-red-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {loc.storageAreas.length === 0 && (
                <p className="text-xs text-stone-400">No storage areas yet</p>
              )}
            </div>

            <div className="flex gap-2">
              <input
                value={newAreaByLoc[loc.id] || ""}
                onChange={(e) =>
                  setNewAreaByLoc({ ...newAreaByLoc, [loc.id]: e.target.value })
                }
                placeholder="e.g. Bar, Red Cabin, Dry Storage"
                className="flex-1 px-3 py-1.5 bg-stone-100 border border-stone-300 rounded-lg text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={() => handleAddArea(loc.id)}
                className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm text-stone-700 transition-colors"
              >
                Add Area
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

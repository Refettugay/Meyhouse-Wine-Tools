"use client";

import { useState } from "react";
import { createUnit, updateUnit, deleteUnit } from "@/lib/actions/units";
import {
  Plus,
  Trash2,
  Beaker,
  Scale,
  Hash,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  ChefHat,
} from "lucide-react";

interface UnitData {
  id: string;
  code: string;
  name: string;
  abbrev: string;
  measureType: string;
  baseFactor: number;
  canPurchase: boolean;
  canRecipe: boolean;
  isActive: boolean;
  isSystem: boolean;
}

const MEASURE_TYPE_INFO: Record<
  string,
  { label: string; icon: any; baseUnit: string; color: string }
> = {
  VOLUME: {
    label: "Volume",
    icon: Beaker,
    baseUnit: "ml",
    color: "text-blue-600 bg-blue-100",
  },
  WEIGHT: {
    label: "Weight",
    icon: Scale,
    baseUnit: "g",
    color: "text-green-600 bg-green-100",
  },
  COUNT: {
    label: "Count",
    icon: Hash,
    baseUnit: "each",
    color: "text-amber-600 bg-amber-100",
  },
};

export function UnitsManager({
  grouped,
}: {
  grouped: Record<string, UnitData[]>;
}) {
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(["VOLUME", "WEIGHT", "COUNT"])
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUnit, setNewUnit] = useState({
    code: "",
    name: "",
    abbrev: "",
    measureType: "VOLUME",
    baseFactor: "",
    canPurchase: true,
    canRecipe: true,
  });

  function toggleSection(type: string) {
    const newSet = new Set(expanded);
    if (newSet.has(type)) newSet.delete(type);
    else newSet.add(type);
    setExpanded(newSet);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const result = await createUnit({
      ...newUnit,
      baseFactor: parseFloat(newUnit.baseFactor) || 0,
    });
    if (result?.error) {
      setError(result.error);
    } else {
      setShowAddForm(false);
      setNewUnit({
        code: "",
        name: "",
        abbrev: "",
        measureType: "VOLUME",
        baseFactor: "",
        canPurchase: true,
        canRecipe: true,
      });
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Add new unit */}
      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 text-amber-600 hover:text-amber-700 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Custom Unit
        </button>
      ) : (
        <div className="bg-white border border-amber-300 rounded-xl p-4">
          <h3 className="font-semibold text-amber-700 mb-3">New Unit</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-stone-600 mb-1">
                  Code *
                </label>
                <input
                  value={newUnit.code}
                  onChange={(e) =>
                    setNewUnit({ ...newUnit, code: e.target.value })
                  }
                  placeholder="e.g. bib5gal"
                  className="w-full px-2 py-1.5 bg-stone-100 border border-stone-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-600 mb-1">
                  Name *
                </label>
                <input
                  value={newUnit.name}
                  onChange={(e) =>
                    setNewUnit({ ...newUnit, name: e.target.value })
                  }
                  placeholder="e.g. BIB (5 Gallon)"
                  className="w-full px-2 py-1.5 bg-stone-100 border border-stone-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-600 mb-1">
                  Abbreviation
                </label>
                <input
                  value={newUnit.abbrev}
                  onChange={(e) =>
                    setNewUnit({ ...newUnit, abbrev: e.target.value })
                  }
                  placeholder="e.g. BIB 5gal"
                  className="w-full px-2 py-1.5 bg-stone-100 border border-stone-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-600 mb-1">
                  Measure Type
                </label>
                <select
                  value={newUnit.measureType}
                  onChange={(e) =>
                    setNewUnit({ ...newUnit, measureType: e.target.value })
                  }
                  className="w-full px-2 py-1.5 bg-stone-100 border border-stone-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="VOLUME">Volume</option>
                  <option value="WEIGHT">Weight</option>
                  <option value="COUNT">Count</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-stone-600 mb-1">
                  = how many{" "}
                  {MEASURE_TYPE_INFO[newUnit.measureType]?.baseUnit || "base"}?
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={newUnit.baseFactor}
                  onChange={(e) =>
                    setNewUnit({ ...newUnit, baseFactor: e.target.value })
                  }
                  placeholder="e.g. 18927"
                  className="w-full px-2 py-1.5 bg-stone-100 border border-stone-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <p className="text-xs text-stone-400 mt-0.5">
                  1 of this unit ={" "}
                  {newUnit.baseFactor || "?"}{" "}
                  {MEASURE_TYPE_INFO[newUnit.measureType]?.baseUnit}
                </p>
              </div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-1 text-xs text-stone-600">
                  <input
                    type="checkbox"
                    checked={newUnit.canPurchase}
                    onChange={(e) =>
                      setNewUnit({
                        ...newUnit,
                        canPurchase: e.target.checked,
                      })
                    }
                    className="w-3 h-3"
                  />
                  Purchasing
                </label>
                <label className="flex items-center gap-1 text-xs text-stone-600">
                  <input
                    type="checkbox"
                    checked={newUnit.canRecipe}
                    onChange={(e) =>
                      setNewUnit({ ...newUnit, canRecipe: e.target.checked })
                    }
                    className="w-3 h-3"
                  />
                  Recipes
                </label>
              </div>
              <div className="flex items-end gap-2 col-span-2">
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-1.5 bg-stone-100 hover:bg-stone-200 rounded text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Unit sections by measure type */}
      {Object.entries(grouped).map(([type, units]) => {
        const info = MEASURE_TYPE_INFO[type];
        const Icon = info?.icon || Hash;
        const isExpanded = expanded.has(type);

        return (
          <div
            key={type}
            className="bg-white border border-stone-200 rounded-xl overflow-hidden"
          >
            <button
              onClick={() => toggleSection(type)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-stone-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${info?.color || "bg-stone-100"}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <h2 className="font-semibold">{info?.label || type}</h2>
                  <p className="text-xs text-stone-500">
                    {units.length} units · base ={" "}
                    {info?.baseUnit || "?"}
                  </p>
                </div>
              </div>
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-stone-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-stone-400" />
              )}
            </button>

            {isExpanded && (
              <div className="border-t border-stone-200">
                {/* Header */}
                <div className="hidden md:grid md:grid-cols-12 gap-2 px-4 py-2 text-xs text-stone-500 uppercase font-medium bg-stone-50">
                  <div className="col-span-2">Code</div>
                  <div className="col-span-3">Name</div>
                  <div className="col-span-1">Abbrev</div>
                  <div className="col-span-2 text-right">
                    = {info?.baseUnit}
                  </div>
                  <div className="col-span-1 text-center">
                    <ShoppingCart className="w-3 h-3 inline" />
                  </div>
                  <div className="col-span-1 text-center">
                    <ChefHat className="w-3 h-3 inline" />
                  </div>
                  <div className="col-span-1 text-center">Active</div>
                  <div className="col-span-1"></div>
                </div>

                <div className="divide-y divide-stone-200">
                  {units.map((unit) => (
                    <div
                      key={unit.id}
                      className={`px-4 py-2 grid grid-cols-12 gap-2 items-center text-sm ${
                        !unit.isActive ? "opacity-50" : ""
                      }`}
                    >
                      <div className="col-span-6 md:col-span-2 font-mono text-xs text-stone-600">
                        {unit.code}
                      </div>
                      <div className="col-span-6 md:col-span-3">
                        {unit.name}
                      </div>
                      <div className="hidden md:block md:col-span-1 text-stone-500">
                        {unit.abbrev}
                      </div>
                      <div className="hidden md:block md:col-span-2 text-right text-stone-700 font-mono text-xs">
                        {unit.baseFactor}
                      </div>
                      <div className="hidden md:flex md:col-span-1 justify-center">
                        <button
                          onClick={async () =>
                            updateUnit(unit.id, {
                              canPurchase: !unit.canPurchase,
                            })
                          }
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                            unit.canPurchase
                              ? "bg-blue-500 text-white"
                              : "bg-stone-200 text-stone-500"
                          }`}
                        >
                          {unit.canPurchase ? "✓" : ""}
                        </button>
                      </div>
                      <div className="hidden md:flex md:col-span-1 justify-center">
                        <button
                          onClick={async () =>
                            updateUnit(unit.id, {
                              canRecipe: !unit.canRecipe,
                            })
                          }
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                            unit.canRecipe
                              ? "bg-amber-500 text-white"
                              : "bg-stone-200 text-stone-500"
                          }`}
                        >
                          {unit.canRecipe ? "✓" : ""}
                        </button>
                      </div>
                      <div className="hidden md:flex md:col-span-1 justify-center">
                        <button
                          onClick={async () =>
                            updateUnit(unit.id, {
                              isActive: !unit.isActive,
                            })
                          }
                          className={`w-8 h-4 rounded-full relative transition-colors ${
                            unit.isActive ? "bg-green-500" : "bg-stone-300"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                              unit.isActive
                                ? "translate-x-4"
                                : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </div>
                      <div className="hidden md:flex md:col-span-1 justify-end">
                        {!unit.isSystem && (
                          <button
                            onClick={async () => {
                              if (
                                confirm(`Delete unit "${unit.name}"?`)
                              ) {
                                const r = await deleteUnit(unit.id);
                                if (r?.error) setError(r.error);
                              }
                            }}
                            className="text-stone-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

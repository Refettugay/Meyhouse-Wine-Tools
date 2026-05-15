import { getUnits } from "@/lib/actions/units";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { UnitsManager } from "@/components/settings/units-manager";

export default async function UnitsPage() {
  const units = await getUnits();

  const grouped = {
    VOLUME: units.filter((u) => u.measureType === "VOLUME"),
    WEIGHT: units.filter((u) => u.measureType === "WEIGHT"),
    COUNT: units.filter((u) => u.measureType === "COUNT"),
  };

  return (
    <div className="p-4 lg:p-8 max-w-4xl">
      <Link
        href="/dashboard/settings"
        className="flex items-center gap-2 text-stone-500 hover:text-stone-900 mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Settings
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Units of Measure</h1>
        <p className="text-stone-500 text-sm mt-1">
          {units.length} units across Volume, Weight, and Count. Toggle
          purchasing and recipe availability per unit.
        </p>
      </div>

      <UnitsManager grouped={grouped} />
    </div>
  );
}

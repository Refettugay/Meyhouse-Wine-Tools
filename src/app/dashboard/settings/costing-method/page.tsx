import { getCostingMethod, getKpiExcludedEmployees, getKpiSpecialAccounts } from "@/lib/actions/finans-lab";
import { CostingMethodForm } from "@/components/finans-lab/costing-method-form";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function CostingMethodSettingsPage() {
  const [method, excluded, special] = await Promise.all([
    getCostingMethod(),
    getKpiExcludedEmployees(),
    getKpiSpecialAccounts(),
  ]);

  return (
    <div className="p-4 lg:p-8 max-w-2xl">
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1 text-sm text-[var(--ink-muted)] hover:text-[var(--brand-brown)] mb-4"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Settings
      </Link>

      <h1 className="text-2xl font-bold mb-6">Finance Hub Settings</h1>

      <CostingMethodForm
        initialMethod={method}
        initialExcluded={excluded}
        initialSpecial={special}
      />
    </div>
  );
}

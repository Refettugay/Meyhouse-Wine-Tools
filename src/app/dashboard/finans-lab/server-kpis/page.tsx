import { EmptyState } from "@/components/finans-lab/empty-state";
import { Users } from "lucide-react";

export default function ServerKpisPage() {
  return (
    <EmptyState
      icon={Users}
      title="Server KPIs"
      description="Per-server performance scoring with peer comparison. Weighted KPI: Sales/Guest 20%, Bev/Guest 30%, Bev Mix 30%, Sales/Day 20%. Elite (115+), Strong (100-114), Solid (85-99), Needs Improvement (70-84), Major Opportunity (<70)."
      comingSoonFeatures={[
        "Weekly leaderboard with score + tier",
        "Individual server detail page (weighted KPI table)",
        "Cross-location comparison (PA vs SV)",
        "PDR Banquet tracked separately (not in leaderboard)",
        "Excluded accounts: Online Ordering, Unknown, managers",
        "Printable coaching report per server",
        "Weekly Executive Summary (multi-location)",
      ]}
    />
  );
}

import { EmptyState } from "@/components/finans-lab/empty-state";
import { Wallet } from "lucide-react";

export default function BudgetPage() {
  return (
    <EmptyState
      icon={Wallet}
      title="Budget"
      description="Monthly budget tracking by category (Food, Wine, Liquor, Beer, Labor) with real-time variance. Integrates with the Ordering Cart to warn when a pending order would push a category over budget."
      comingSoonFeatures={[
        "Monthly budget per category",
        "Actual vs budget variance with status",
        "Progress bar: days elapsed vs budget consumed",
        "Cart integration — budget warning at checkout",
        "Rolling 12-month history",
        "Per-location budgets",
      ]}
    />
  );
}

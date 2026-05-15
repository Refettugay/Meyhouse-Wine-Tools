import { EmptyState } from "@/components/finans-lab/empty-state";
import { Package } from "lucide-react";

export default function InventoryInsightsPage() {
  return (
    <EmptyState
      icon={Package}
      title="Inventory Insights"
      description="Capital sitting on shelves, inventory turnover, and variance analysis (theoretical vs actual). Uses the costing method selected in Settings (WAC, FIFO, or LIFO)."
      comingSoonFeatures={[
        "Sitting Cash — total $ tied up in inventory",
        "Average days of inventory (turnover)",
        "Variance report (theoretical - actual)",
        "Dusty Shelf — 60+ day no-sale list",
        "Top Capital Sitting — most expensive slow movers",
        "WAC / FIFO / LIFO cost layer tracking",
      ]}
    />
  );
}

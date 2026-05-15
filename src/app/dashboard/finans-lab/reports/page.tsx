import { EmptyState } from "@/components/finans-lab/empty-state";
import { FileText } from "lucide-react";

export default function ReportsPage() {
  return (
    <EmptyState
      icon={FileText}
      title="Reports"
      description="Weekly Executive Summary (PPTX) auto-generated every Monday 9:00 AM. Individual server performance reports. Custom reports including Menu Engineering, Bev Mix Breakdown, Variance, and Week-over-Week comparison."
      comingSoonFeatures={[
        "Weekly Executive Summary (multi-location PPTX)",
        "Auto-email delivery every Monday 9:00 AM",
        "Per-server weekly performance report",
        "Menu Engineering (Star / Puzzle / Plow / Dog)",
        "Bev Mix Breakdown by location / daypart / server",
        "Variance Report (theoretical vs actual inventory)",
        "Week-over-Week comparison",
      ]}
    />
  );
}

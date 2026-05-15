import { FinanceHubTabs } from "@/components/finans-lab/finans-lab-tabs";

export default function FinanceHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Finance Hub</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Restaurant performance, pricing, and financial health
          </p>
        </div>
      </div>

      {/* Tab navigation (Product Hub style: pill segmented control) */}
      <FinanceHubTabs />

      {/* Tab content */}
      <div>{children}</div>
    </div>
  );
}

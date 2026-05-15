import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { canSeePricingHub } from "@/lib/permissions";
import { PricingHubTabs } from "@/components/pricing-hub/pricing-hub-tabs";

export default async function PricingHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();
  if (!canSeePricingHub(session)) {
    notFound();
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Pricing Hub</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Set menu prices, cost targets, and margin for every category.
          </p>
        </div>
      </div>

      <PricingHubTabs />

      <div>{children}</div>
    </div>
  );
}

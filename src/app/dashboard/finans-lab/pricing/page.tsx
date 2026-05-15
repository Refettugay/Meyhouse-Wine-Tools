import { redirect } from "next/navigation";

// Pricing moved to its own Pricing Hub (own sidebar item).
// Keep this route as a redirect so any stale link still works.
export default function FinanceHubPricingRedirect() {
  redirect("/dashboard/pricing-hub");
}

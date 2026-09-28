import { redirect } from "next/navigation";

// Review & approve now lives in Product Hub → Order tab → "Review & approve"
// (one card per store, emails copied by hand). This old URL just forwards there.
export default function OrderReviewPage() {
  redirect("/dashboard/products?mode=ordering&view=review");
}

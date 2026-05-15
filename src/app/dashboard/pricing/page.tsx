import { redirect } from "next/navigation";

export default function PricingRedirect() {
  redirect("/dashboard/products?mode=pricing");
}

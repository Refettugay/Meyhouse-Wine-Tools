import { redirect } from "next/navigation";

export default function InventoryRedirect() {
  redirect("/dashboard/products?mode=ordering");
}

import { redirect } from "next/navigation";

export default function DatabaseRedirect() {
  redirect("/dashboard/products?status=database");
}

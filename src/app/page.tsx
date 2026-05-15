import { redirect } from "next/navigation";

// Beverage's root route. The proxy.ts middleware has already enforced
// that the user is signed in and has owner/manager/supervisor role in
// Schedule's profiles table, so this just sends them into the dashboard.
export default function Home() {
  redirect("/dashboard");
}

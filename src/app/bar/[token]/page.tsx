import { recipeLinkActive } from "@/lib/recipe-book/link";
import { RecipeBookEntry } from "./client-entry";

// Staff Recipe Book — reached only through the group's secret link
// (/bar/<token>). No Sophra login: staff sign in with their PIN.
export const dynamic = "force-dynamic";

export default async function BarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const active = await recipeLinkActive(token);
  return <RecipeBookEntry token={token} linkActive={active} />;
}

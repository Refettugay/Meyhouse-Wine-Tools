import { prisma } from "@/lib/db";
import { barRecipeAdmin } from "@/lib/actions/bar-recipes";
import { RecipeLinkCard } from "@/components/bar-recipes/recipe-link-card";
import { AdminBookEntry } from "@/components/bar-recipes/admin-book-entry";
import { rbSerif, rbSans } from "@/components/recipe-book/fonts";
import "@/components/recipe-book/recipe-book.css";

// Admin home of the staff bar Recipe Book (owners + managers): the one group
// link, then the Recipe Book itself — same screens as the staff page (editor,
// change history, revert), saves stamped with the signed-in account.
export const dynamic = "force-dynamic";

export default async function BarRecipesPage() {
  const a = await barRecipeAdmin();
  if (!a.ok) {
    return (
      <div className="p-4 lg:p-8 max-w-3xl">
        <h1 className="text-2xl font-bold">Bar recipe book</h1>
        <p className="text-[var(--ink-muted)] text-sm mt-2">{a.error}</p>
      </div>
    );
  }
  const [link, counts, accessRows] = await Promise.all([
    prisma.barRecipeLink.findUnique({ where: { id: 1 } }),
    prisma.barRecipe.groupBy({ by: ["category"], where: { active: true }, _count: { _all: true } }),
    prisma.$queryRaw<{ name: string }[]>`
      select pos.name from beverage.position_recipe_access pra
      join public.positions pos on pos.id = pra.position_id
      where pra.enabled order by pos.sort_order, pos.name`,
  ]);
  const total = counts.reduce((s, c) => s + c._count._all, 0);
  return (
    <div className="p-4 lg:p-8 max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bar recipe book</h1>
        <p className="text-[var(--ink-muted)] text-sm mt-1">
          The staff recipe page with batch calculators, in English, Turkish and Spanish. {total} recipes.
        </p>
      </div>
      <RecipeLinkCard
        link={link ? { token: link.token, enabled: link.enabled, since: (link.rotatedAt ?? link.createdAt).toISOString() } : null}
      />
      <div className="border border-[var(--line)] rounded-xl p-4 text-sm space-y-1">
        <h2 className="font-semibold text-[var(--brand-brown)]">Who can open it</h2>
        <p className="text-[var(--ink-muted)]">
          Owners always. Managers and supervisors when active. Everyone else when active and in a position ticked
          under <b>Recipe access by position</b> on the Team page.
        </p>
        <p>
          Ticked now: {accessRows.length ? accessRows.map((r) => r.name).join(", ") : <span className="text-[var(--ink-muted)]">no positions</span>}
        </p>
      </div>
      <div className="rounded-xl overflow-clip border border-[var(--line)]">
        <div className={`rb rb-embed ${rbSerif.variable} ${rbSans.variable}`}>
          <AdminBookEntry />
        </div>
      </div>
    </div>
  );
}

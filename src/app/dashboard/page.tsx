import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Wine, FlaskConical, DollarSign } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await requireAuth();
  const orgId = session.organizationId;

  const [recipeCount, ingredientCount, categoryCount] = await Promise.all([
    prisma.recipe.count({ where: { organizationId: orgId, isArchived: false } }),
    prisma.ingredient.count({ where: { organizationId: orgId, isActive: true, onMenu: true } }),
    prisma.category.count({ where: { organizationId: orgId } }),
  ]);

  return (
    <div className="p-4 lg:p-8">
        <div className="mb-8">
          <div className="eyebrow">
            Sophra Beverage · {session.organizationName}
          </div>
          <h1
            className="text-2xl"
            style={{
              fontWeight: 500,
              letterSpacing: "-0.01em",
              color: "var(--brand-brown)",
            }}
          >
            Welcome, {session.userName.split(" ")[0]}
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--ink-muted)" }}
          >
            Recipe and inventory management
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <StatCard
            href="/dashboard/recipes"
            icon={<Wine className="w-8 h-8 mb-2" style={{ color: "var(--brand-olive)" }} />}
            count={recipeCount}
            label="Recipes"
          />
          <StatCard
            href="/dashboard/ingredients"
            icon={<FlaskConical className="w-8 h-8 mb-2" style={{ color: "var(--brand-olive)" }} />}
            count={ingredientCount}
            label="Ingredients"
          />
          <StatCard
            href="/dashboard/pricing"
            icon={<DollarSign className="w-8 h-8 mb-2" style={{ color: "var(--brand-olive)" }} />}
            count={categoryCount}
            label="Categories"
          />
        </div>

        {/* Quick actions */}
        <div className="space-y-4">
          <h2
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--brand-olive)" }}
          >
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <QuickActionCard
              href="/dashboard/recipes/new"
              title="Add New Recipe"
              sub="Create a new cocktail recipe"
            />
            <QuickActionCard
              href="/dashboard/products/new"
              title="Add New Product"
              sub="Add a spirit, wine, beer, grocery, or any product"
            />
          </div>
        </div>
    </div>
  );
}

function StatCard({
  href,
  icon,
  count,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  count: number;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl p-4 transition-colors"
      style={{
        background: "white",
        border: "1px solid var(--line)",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = "var(--brand-olive)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
    >
      {icon}
      <p
        className="text-2xl"
        style={{ fontWeight: 500, color: "var(--brand-brown)" }}
      >
        {count}
      </p>
      <p
        className="text-xs font-semibold uppercase tracking-wide mt-1"
        style={{ color: "var(--ink-muted)" }}
      >
        {label}
      </p>
    </Link>
  );
}

function QuickActionCard({
  href,
  title,
  sub,
}: {
  href: string;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl p-4 transition-colors"
      style={{
        background: "white",
        border: "1px solid var(--line)",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = "var(--brand-olive)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
    >
      <p
        className="font-medium"
        style={{ color: "var(--brand-brown)" }}
      >
        {title}
      </p>
      <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>
        {sub}
      </p>
    </Link>
  );
}

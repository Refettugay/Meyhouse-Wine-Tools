import { requireAuth } from "@/lib/session";
import { SignOutButton } from "@/components/auth/sign-out-button";
import Link from "next/link";
import { Settings as SettingsIcon, ListPlus, ChevronRight, Beaker, Tag, MapPin, TrendingUp, Building2 } from "lucide-react";

export default async function SettingsPage() {
  const session = await requireAuth();

  return (
    <div className="p-4 lg:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-4">
        <div className="bg-white border border-[var(--line)] rounded-xl p-4">
          <h2 className="font-semibold mb-3">Account</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--ink-muted)]">Name</span>
              <span>{session.userName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--ink-muted)]">Email</span>
              <span>{session.userEmail}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--ink-muted)]">Role</span>
              <span>{session.role}</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[var(--line)] rounded-xl p-4">
          <h2 className="font-semibold mb-3">Organization</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--ink-muted)]">Restaurant</span>
              <span>{session.organizationName}</span>
            </div>
          </div>
        </div>

        {/* Lookup values link */}
        <Link
          href="/dashboard/settings/lookups"
          className="block bg-white border border-[var(--line)] rounded-xl p-4 hover:border-[var(--brand-olive)] transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[rgba(74,93,39,0.12)] flex items-center justify-center">
                <ListPlus className="w-5 h-5 text-[var(--brand-olive)]" />
              </div>
              <div>
                <h2 className="font-semibold">Lookup Values</h2>
                <p className="text-xs text-[var(--ink-muted)]">
                  Manage bottle sizes, case sizes, and categories
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--ink-muted)]" />
          </div>
        </Link>

        {/* Categories link */}
        <Link
          href="/dashboard/settings/categories"
          className="block bg-white border border-[var(--line)] rounded-xl p-4 hover:border-[var(--brand-olive)] transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Tag className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="font-semibold">Product Categories</h2>
                <p className="text-xs text-[var(--ink-muted)]">
                  Add, rename, merge, or delete product categories
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--ink-muted)]" />
          </div>
        </Link>

        {/* Locations link */}
        <Link
          href="/dashboard/inventory/locations"
          className="block bg-white border border-[var(--line)] rounded-xl p-4 hover:border-[var(--brand-olive)] transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="font-semibold">Locations</h2>
                <p className="text-xs text-[var(--ink-muted)]">
                  Add, rename, or remove restaurant locations (e.g. Palo Alto, San Ramon)
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--ink-muted)]" />
          </div>
        </Link>

        {/* Storage Areas link */}
        <Link
          href="/dashboard/settings/storage-areas"
          className="block bg-white border border-[var(--line)] rounded-xl p-4 hover:border-[var(--brand-olive)] transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="font-semibold">Storage Areas</h2>
                <p className="text-xs text-[var(--ink-muted)]">
                  Manage storage area names per location (Bar, Liquor Room, etc.)
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--ink-muted)]" />
          </div>
        </Link>

        {/* Finance Hub Settings link */}
        <Link
          href="/dashboard/settings/costing-method"
          className="block bg-white border border-[var(--line)] rounded-xl p-4 hover:border-[var(--brand-olive)] transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h2 className="font-semibold">Finance Hub Settings</h2>
                <p className="text-xs text-[var(--ink-muted)]">
                  Costing method (WAC/FIFO/LIFO), KPI exclusions, special accounts
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--ink-muted)]" />
          </div>
        </Link>

        {/* Units of Measure link */}
        <Link
          href="/dashboard/settings/units"
          className="block bg-white border border-[var(--line)] rounded-xl p-4 hover:border-[var(--brand-olive)] transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Beaker className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold">Units of Measure</h2>
                <p className="text-xs text-[var(--ink-muted)]">
                  Volume, weight, and count units for products and recipes
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--ink-muted)]" />
          </div>
        </Link>

        <SignOutButton />
      </div>
    </div>
  );
}

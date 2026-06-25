// Permission helpers for the Beverage app.
//
// LAYERED MODEL (post Aşama 1 of team-migration):
//   1. New app-permission system (migrations 0033-0035) — feature_key
//      grants resolved through profile_app_access + profile_feature_overrides.
//   2. Legacy role-based gates — kept as safe-transition fallback for any
//      session whose profile_app_access rows are missing (data wasn't
//      seeded, account predates 0033, etc).
//
// canSeePricingHub / canEditPricing prefer (1) and fall back to (2).

import type {
  App,
  AppRole,
  ProfileAppAccess,
  ProfileFeatureOverride,
} from "./types";

// ============================================================================
// NEW PERMISSION SYSTEM (mirror of launcher/scheduling lib/permissions.ts)
// ============================================================================

export const ROLE_GRANTS: Record<App, Record<AppRole, ReadonlySet<string>>> = {
  SCHEDULING: {
    admin: new Set([
      "scheduling.access",
      "scheduling.shifts.view",
      "scheduling.shifts.edit",
      "scheduling.publish",
      "scheduling.staff.view",
      "scheduling.staff.manage",
      "scheduling.lineups.edit",
      "scheduling.requests.review",
    ]),
    manager: new Set([
      "scheduling.access",
      "scheduling.shifts.view",
      "scheduling.shifts.edit",
      "scheduling.publish",
      "scheduling.staff.view",
      "scheduling.staff.manage",
      "scheduling.lineups.edit",
      "scheduling.requests.review",
    ]),
    staff: new Set(["scheduling.access", "scheduling.shifts.view"]),
    viewer: new Set(["scheduling.access", "scheduling.shifts.view"]),
  },
  BEVERAGE: {
    admin: new Set([
      "beverage.access",
      "beverage.menu.view",
      "beverage.menu.edit",
      "beverage.pricing.view",
      "beverage.pricing.edit",
      "beverage.inventory.view",
      "beverage.inventory.write",
      "beverage.reports.view",
    ]),
    manager: new Set([
      "beverage.access",
      "beverage.menu.view",
      "beverage.menu.edit",
      "beverage.pricing.view",
      "beverage.pricing.edit",
      "beverage.inventory.view",
      "beverage.inventory.write",
      "beverage.reports.view",
    ]),
    staff: new Set([
      "beverage.access",
      "beverage.menu.view",
      "beverage.inventory.view",
      "beverage.inventory.write",
    ]),
    viewer: new Set([
      "beverage.access",
      "beverage.menu.view",
      "beverage.inventory.view",
    ]),
  },
};

// All beverage feature keys session.ts hydrates into the permissions{} map.
// Stable list — matches the feature_permissions seed in migration 0033.
export const BEVERAGE_FEATURES: readonly string[] = [
  "beverage.access",
  "beverage.menu.view",
  "beverage.menu.edit",
  "beverage.pricing.view",
  "beverage.pricing.edit",
  "beverage.inventory.view",
  "beverage.inventory.write",
  "beverage.reports.view",
];

export function featureApp(featureKey: string): App | null {
  if (featureKey.startsWith("scheduling.")) return "SCHEDULING";
  if (featureKey.startsWith("beverage.")) return "BEVERAGE";
  return null;
}

export function roleGrantsFeature(
  app: App,
  role: AppRole,
  featureKey: string,
): boolean {
  return ROLE_GRANTS[app][role].has(featureKey);
}

export function hasFeature(
  featureKey: string,
  appAccess: ProfileAppAccess[],
  overrides: ProfileFeatureOverride[],
): boolean {
  const override = overrides.find((o) => o.feature_key === featureKey);
  if (override) return override.allowed;

  const app = featureApp(featureKey);
  if (!app) return false;

  const access = appAccess.find((a) => a.app === app);
  if (!access) return false;

  return roleGrantsFeature(app, access.role, featureKey);
}

export function appRole(
  app: App,
  appAccess: ProfileAppAccess[],
): AppRole | null {
  return appAccess.find((a) => a.app === app)?.role ?? null;
}

// ============================================================================
// LEGACY ROLE-BASED PERMISSION HELPERS
// Kept as the safe-transition fallback. Same surface as pre-0033 — every
// caller in the codebase still imports canSeePricingHub / canEditPricing
// and gets the same answer unless the new system has been hydrated.
// ============================================================================

type SessionLike = {
  role?: string;
  permissions?: Record<string, unknown>;
};

const EDIT_PRICING_ROLES = new Set(["OWNER", "ADMIN", "MANAGER"]);

// Only owners/admins may review & approve manager-submitted orders. Managers
// build and submit orders but cannot approve their own. Enforced server-side
// in the order actions and the review page — never trust the client.
const APPROVE_ORDER_ROLES = new Set(["OWNER", "ADMIN"]);

/**
 * True when this user can review/approve submitted orders and email approved
 * orders to vendors. Owners and admins only.
 */
export function canApproveOrders(
  session: SessionLike | null | undefined,
): boolean {
  if (!session) return false;
  return !!session.role && APPROVE_ORDER_ROLES.has(session.role);
}

/**
 * Has the new app-permission system been hydrated for this session?
 * (session.ts only populates permissions{} when profile_app_access has
 * rows for the user. Empty {} means "no new-system data — use legacy".)
 */
function hasNewSystemHydrated(session: SessionLike): boolean {
  return (
    !!session.permissions &&
    Object.keys(session.permissions).length > 0
  );
}

/**
 * True when this user can EDIT menu prices / targets / suggestions.
 * New system: beverage.pricing.edit.
 * Legacy: OWNER / ADMIN / MANAGER role, or explicit canEditPricing flag.
 */
export function canEditPricing(session: SessionLike | null | undefined): boolean {
  if (!session) return false;

  if (hasNewSystemHydrated(session)) {
    return session.permissions!["beverage.pricing.edit"] === true;
  }

  // Legacy fallback
  if (session.role && EDIT_PRICING_ROLES.has(session.role)) return true;
  if (session.permissions && session.permissions["canEditPricing"] === true)
    return true;
  return false;
}

/**
 * True when the Pricing Hub sidebar link should appear.
 * New system: beverage.pricing.view.
 * Legacy: same as canEditPricing — read-only users don't need the full
 * hub, they see the read-only mirror inside Product Hub.
 */
export function canSeePricingHub(session: SessionLike | null | undefined): boolean {
  if (!session) return false;

  if (hasNewSystemHydrated(session)) {
    return session.permissions!["beverage.pricing.view"] === true;
  }

  return canEditPricing(session);
}

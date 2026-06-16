import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { prisma } from "./db";
import { BEVERAGE_FEATURES, hasFeature } from "./permissions";
import type { ProfileAppAccess, ProfileFeatureOverride } from "./types";

// URLs of the other Sophra apps. Defaults match production; override in
// .env for local dev (e.g. http://localhost:3001 for the launcher).
const LAUNCHER_URL =
  process.env.NEXT_PUBLIC_LAUNCHER_URL || "https://app.runsophra.com";
const SCHEDULE_URL =
  process.env.NEXT_PUBLIC_SCHEDULE_URL || "https://schedule.runsophra.com";

const LOGIN_URL = `${LAUNCHER_URL}/login`;
const STAFF_LANDING_URL = `${SCHEDULE_URL}/my-shifts`;

// Schedule's profiles.role uses lowercase ('owner', 'manager', 'supervisor',
// 'staff'). Beverage's permissions code (permissions.ts, sidebar links,
// settings page) compares role against uppercase strings ('OWNER',
// 'MANAGER', 'ADMIN', etc.). We translate at this boundary so the 30+
// action files that consume requireAuth() keep working unchanged.
//
// Supervisors share manager-level permissions per migration 0024 in
// scheduling/supabase/migrations/0024_supervisor_role.sql.
function mapScheduleRoleToBeverageRole(scheduleRole: string): string {
  switch (scheduleRole) {
    case "owner":
      return "OWNER";
    case "manager":
    case "supervisor":
      return "MANAGER";
    default:
      return scheduleRole.toUpperCase();
  }
}

// MEYHOUSE_ORG_ID: the single Organization row that owns all Beverage data
// in single-tenant scope. We look it up once and cache, rather than
// hard-coding the id, so the data-migration script can preserve the
// existing CUID without rewriting every foreign key.
let cachedMeyhouseOrg: { id: string; name: string } | null = null;

async function getMeyhouseOrg(): Promise<{ id: string; name: string }> {
  if (cachedMeyhouseOrg) return cachedMeyhouseOrg;
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!org) {
    throw new Error(
      "No Organization row found. Run the data migration (prisma/migrate-sqlite-to-postgres.ts) or seed Meyhouse manually.",
    );
  }
  cachedMeyhouseOrg = org;
  return org;
}

type ProfileRow = {
  id: string;
  full_name: string;
  role: string;
};

export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(LOGIN_URL);
  return { user };
}

export async function getOrganizationId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(LOGIN_URL);
  const org = await getMeyhouseOrg();
  return org.id;
}

export async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(LOGIN_URL);

  // Schedule's profiles table is the single source of truth for who-can-
  // access-what. Beverage reads it on every request rather than syncing.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single<ProfileRow>();

  if (error || !profile) {
    // User authenticated but has no profile row (e.g. invite not yet
    // accepted, or profile row was deleted). Send them through the
    // launcher's login flow so they can sort it out.
    redirect(LOGIN_URL);
  }

  // Hydrate the per-feature permission map from the new app-permission
  // tables (migrations 0033-0035). When profile_app_access has rows for
  // this user we trust the new system fully; when it doesn't, we leave
  // permissions={} and the legacy role-based check in permissions.ts
  // takes over (see canSeePricingHub / canEditPricing).
  const [appAccessResult, overridesResult] = await Promise.all([
    supabase
      .from("profile_app_access")
      .select("user_id, app, role, granted_at, granted_by")
      .eq("user_id", user.id),
    supabase
      .from("profile_feature_overrides")
      .select("user_id, feature_key, allowed, granted_at, granted_by")
      .eq("user_id", user.id),
  ]);

  const appAccess = (appAccessResult.data ?? []) as ProfileAppAccess[];
  const overrides = (overridesResult.data ?? []) as ProfileFeatureOverride[];

  const permissions: Record<string, unknown> = {};
  if (appAccess.length > 0) {
    for (const key of BEVERAGE_FEATURES) {
      permissions[key] = hasFeature(key, appAccess, overrides);
    }
  }

  // Who may open the Beverage app. Prefer the new app-permission system: a
  // user gets in iff they hold beverage.access (granted by a BEVERAGE row in
  // profile_app_access) — regardless of their global 'staff' role, which here
  // just means "not a global manager". Fall back to the legacy global-role
  // gate only when the new system has no rows for this user. Without this, a
  // Beverage manager who is staff overall (per-app access) was bounced
  // straight to Schedule and could never open Beverage.
  const beverageAccess = appAccess.find((a) => a.app === "BEVERAGE");
  if (appAccess.length > 0) {
    if (permissions["beverage.access"] !== true) {
      redirect(STAFF_LANDING_URL);
    }
  } else if (profile.role === "staff") {
    redirect(STAFF_LANDING_URL);
  }

  const org = await getMeyhouseOrg();

  return {
    userId: user.id,
    userName: profile.full_name || user.email || "",
    userEmail: user.email || "",
    organizationId: org.id,
    organizationName: org.name,
    // Beverage role comes from the BEVERAGE app-access grant when present (so
    // a Beverage manager who is staff overall reads as MANAGER here), else the
    // global profile role for legacy sessions without app-access rows.
    role: beverageAccess
      ? mapScheduleRoleToBeverageRole(beverageAccess.role)
      : mapScheduleRoleToBeverageRole(profile.role),
    permissions,
  };
}

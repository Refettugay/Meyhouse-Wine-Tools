// App-permission types mirrored from launcher + scheduling lib/types.ts.
// Kept minimal — beverage only needs the four DB-row shapes the new
// permissions library consumes.
//
// Introduced as part of Aşama 3 of the team-migration plan, when
// beverage's session.ts started hydrating profile_app_access and
// profile_feature_overrides for per-feature gating.

export type App = "SCHEDULING" | "BEVERAGE";
export type AppRole = "viewer" | "staff" | "manager" | "admin";

export type ProfileAppAccess = {
  user_id: string;
  app: App;
  role: AppRole;
  granted_at: string;
  granted_by: string | null;
};

export type FeaturePermission = {
  id: string;
  app: App;
  feature_key: string;
  label: string;
  description: string | null;
  category: string | null;
};

export type ProfileFeatureOverride = {
  user_id: string;
  feature_key: string;
  allowed: boolean;
  granted_at: string;
  granted_by: string | null;
};

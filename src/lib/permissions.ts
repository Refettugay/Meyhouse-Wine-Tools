// Permission helpers for role-based access control.
// Roles today: OWNER (creator), plus any string set on Membership.
// Default invited role is "BARTENDER". As more roles appear we add them here.

type SessionLike = {
  role?: string;
  permissions?: Record<string, unknown>;
};

const EDIT_PRICING_ROLES = new Set(["OWNER", "ADMIN", "MANAGER"]);

/**
 * True when this user can EDIT menu prices / targets / suggestions.
 * - OWNER / ADMIN / MANAGER: always yes
 * - Anyone else: only if explicit permission flag { canEditPricing: true }
 */
export function canEditPricing(session: SessionLike | null | undefined): boolean {
  if (!session) return false;
  if (session.role && EDIT_PRICING_ROLES.has(session.role)) return true;
  if (session.permissions && session.permissions["canEditPricing"] === true)
    return true;
  return false;
}

/**
 * True when the Pricing Hub sidebar link should appear.
 * Same as edit access — read-only users don't need the full hub,
 * they see the read-only mirror inside Product Hub.
 */
export function canSeePricingHub(session: SessionLike | null | undefined): boolean {
  return canEditPricing(session);
}

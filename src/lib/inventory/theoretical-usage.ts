import { prisma } from "@/lib/db";
import { OZ_TO_ML, DASH_TO_ML, BARSPOON_TO_OZ } from "@/lib/calculations/units";

// Convert a RecipeIngredient amount into milliliters.
// Reuses the app's existing volume constants (units.ts) so DASH/BARSPOON stay
// consistent with the rest of the app. Returns null for units that don't map to
// a fixed volume (EACH, DROP, SPLASH, RINSE, TOPOFF, unknown) — the caller skips
// those rather than guessing a volume for them.
function recipeAmountToMl(amount: number, unit: string | null): number | null {
  switch ((unit || "").toUpperCase()) {
    case "OZ":
      return amount * OZ_TO_ML;
    case "ML":
      return amount;
    case "CL":
      return amount * 10;
    case "DASH":
      return amount * DASH_TO_ML;
    case "BARSPOON":
      return amount * BARSPOON_TO_OZ * OZ_TO_ML;
    default:
      // EACH / DROP / SPLASH / RINSE / TOPOFF / unknown → not attributable to a volume.
      return null;
  }
}

export interface TheoreticalUsageItem {
  ingredientId: string;
  lastCountedAt: Date | null;
  bottleSizeMl: number | null;
  productType: string | null;
}

// A direct (non-spirit) ingredient sale that names a whole container. These deplete a
// full container rather than a pour.
const BOTTLE_RE = /\b(bottle|btl|half\s*bottle|magnum|carafe|750\s*ml|375\s*ml|1\.5\s*l)\b/i;
const DOUBLE_RE = /\b(double|dbl)\b/i;
const TRIPLE_RE = /\btriple\b/i;

// Hard-liquor pour sizes (ml), verified against the real Toast PMIX. Rakı and other
// spirits are rung as single / double / half bottle / full bottle. The POS labels are
// literally "Half Bottle" / "Full Bottle" and single/double appear in mixed case.
const SPIRIT_SINGLE_ML = 59.15; // 2 oz
const SPIRIT_DOUBLE_ML = 118.3; // 4 oz
const SPIRIT_HALF_BOTTLE_ML = 350;
const SPIRIT_FULL_BOTTLE_ML = 700;

// Volume (ml) depleted by ONE unit of a direct ingredient sale.
// SPIRIT: parse the pour token from the item name case-insensitively — full/half bottle
// are checked before single/double. If none of the four tokens is present the row is not
// attributable, so return null and the caller skips it (do NOT fall back to a bottle or a
// standard pour). Wine/beer are not sold this way, so they keep container-or-standard-pour
// sizing.
export function directSaleServingMl(
  rawItemName: string,
  rawMenuGroup: string | null,
  productType: string | null,
  bottleSizeMl: number,
  standardPours: Record<string, number>,
): number | null {
  if (productType === "SPIRIT") {
    const name = rawItemName.toLowerCase();
    if (name.includes("full bottle")) return SPIRIT_FULL_BOTTLE_ML;
    if (name.includes("half bottle")) return SPIRIT_HALF_BOTTLE_ML;
    if (/\bdouble\b/.test(name)) return SPIRIT_DOUBLE_ML;
    if (/\bsingle\b/.test(name)) return SPIRIT_SINGLE_ML;
    return null; // no pour token → not attributable, skip the row
  }

  // Wine / beer / other: bottle sales deplete a container; otherwise one standard pour.
  const text = `${rawItemName} ${rawMenuGroup || ""}`;
  if (BOTTLE_RE.test(text)) return bottleSizeMl; // genuine bottle sale → one container

  const pourOz = productType ? standardPours[productType] : undefined;
  if (!pourOz || pourOz <= 0) {
    // No standard pour to size a pour with → fall back to one container.
    return bottleSizeMl;
  }
  const multiplier = TRIPLE_RE.test(rawItemName) ? 3 : DOUBLE_RE.test(rawItemName) ? 2 : 1;
  return pourOz * OZ_TO_ML * multiplier;
}

/**
 * Theoretical usage = how much of each ingredient POS sales say SHOULD have been
 * consumed at one location since that item's last inventory count.
 *
 * Returns Map-like Record<ingredientId, theoreticalUsageInCountUnits> for ONE
 * location. The result is expressed in the inventory COUNT unit (bottles/eaches),
 * matching how `actualUsage`/`prev`/`purchased` are measured in the variance row,
 * by dividing the summed volume (ml) by the ingredient's bottleSizeMl.
 *
 *   theoretical_volume_ml =
 *       Σ matched recipe sales:  qtySold × recipeIngredient.amount(→ ml)
 *     + Σ direct ingredient sales: qtySold × directSaleServingMl (pour or container)
 *   theoretical_in_count_units = theoretical_volume_ml / bottleSizeMl
 *
 * Only items with a real lastCountedAt AND a positive bottleSizeMl get a number;
 * others are simply absent from the result (caller treats absent as 0/blank).
 *
 * `standardPours` is the org's per-product-type standard pour in fluid ounces
 * (Organization.settingsStandardPours), used to size direct pour sales.
 */
export async function computeTheoreticalUsage(
  orgId: string,
  locationId: string,
  items: TheoreticalUsageItem[],
  standardPours: Record<string, number>,
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};

  // Only items that have been counted (period start) and have a bottle size we can
  // divide by are eligible. Without lastCountedAt we'd have no window; without
  // bottleSizeMl we'd divide by zero — in both cases theoretical stays undefined.
  const eligible = items.filter(
    (i) => i.lastCountedAt != null && i.bottleSizeMl != null && i.bottleSizeMl > 0,
  );
  if (eligible.length === 0) return result;

  const metaByIngredient = new Map<
    string,
    { lastCountedAt: Date; bottleSizeMl: number; productType: string | null }
  >();
  for (const i of eligible) {
    metaByIngredient.set(i.ingredientId, {
      lastCountedAt: i.lastCountedAt as Date,
      bottleSizeMl: i.bottleSizeMl as number,
      productType: i.productType,
    });
  }

  // Earliest cutoff across all eligible items → one fetch window covering everyone.
  // Each item still gets its own lastCountedAt cutoff applied in memory below.
  let earliest = eligible[0].lastCountedAt as Date;
  for (const i of eligible) {
    const d = i.lastCountedAt as Date;
    if (d < earliest) earliest = d;
  }

  const snapshotSelect = {
    periodStart: true,
    itemSales: {
      where: {
        OR: [{ matchedRecipeId: { not: null } }, { matchedIngredientId: { not: null } }],
      },
      select: {
        qtySold: true,
        matchedIngredientId: true,
        rawItemName: true,
        rawMenuGroup: true,
        matchedRecipe: {
          select: {
            ingredients: {
              select: { ingredientId: true, amount: true, unit: true },
            },
          },
        },
      },
    },
  };

  // Prefer location-specific snapshots; only fall back to org-wide (locationId = null)
  // aggregated uploads when this location has none in the window. This avoids
  // double-counting the same sales when both a per-location and an aggregated upload exist.
  let snapshots = await prisma.salesSnapshot.findMany({
    where: { organizationId: orgId, locationId, periodStart: { gte: earliest } },
    select: snapshotSelect,
  });
  if (snapshots.length === 0) {
    snapshots = await prisma.salesSnapshot.findMany({
      where: { organizationId: orgId, locationId: null, periodStart: { gte: earliest } },
      select: snapshotSelect,
    });
  }

  // Accumulate consumed volume (ml) per ingredient, respecting each item's own last-count cutoff.
  const volumeMlByIngredient = new Map<string, number>();
  const addVolume = (ingredientId: string, periodStart: Date, ml: number) => {
    const meta = metaByIngredient.get(ingredientId);
    if (!meta) return; // ingredient isn't counted at this location → not in the variance table
    if (periodStart < meta.lastCountedAt) return; // sale predates this item's last count
    volumeMlByIngredient.set(ingredientId, (volumeMlByIngredient.get(ingredientId) || 0) + ml);
  };

  for (const snap of snapshots) {
    const periodStart = snap.periodStart;
    for (const sale of snap.itemSales) {
      if (sale.matchedRecipe) {
        // Recipe sale: deplete each recipe ingredient by amount × qty.
        // TODO: expand sub-recipes — a recipe ingredient may itself be house-made
        // (Ingredient.subRecipeId / isHouseMade). For this pass we treat it as a leaf
        // and deplete the house-made item directly, without recursing into its sub-recipe.
        for (const ri of sale.matchedRecipe.ingredients) {
          const ml = recipeAmountToMl(ri.amount, ri.unit);
          if (ml == null) continue; // non-volume unit → skip rather than guess
          addVolume(ri.ingredientId, periodStart, sale.qtySold * ml);
        }
      } else if (sale.matchedIngredientId) {
        // Direct ingredient sale. Spirits are rung as single/double/half bottle/full
        // bottle; wine/beer as container-or-standard-pour. directSaleServingMl returns
        // null for a spirit row with no recognizable pour token → skip it.
        const meta = metaByIngredient.get(sale.matchedIngredientId);
        if (meta) {
          const servingMl = directSaleServingMl(
            sale.rawItemName,
            sale.rawMenuGroup,
            meta.productType,
            meta.bottleSizeMl,
            standardPours,
          );
          if (servingMl != null) {
            addVolume(sale.matchedIngredientId, periodStart, sale.qtySold * servingMl);
          }
        }
      }
    }
  }

  // Convert accumulated volume → inventory count units (bottles/eaches).
  for (const [ingredientId, volumeMl] of volumeMlByIngredient) {
    const meta = metaByIngredient.get(ingredientId);
    if (!meta) continue;
    result[ingredientId] = volumeMl / meta.bottleSizeMl;
  }

  return result;
}

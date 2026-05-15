// =============================================================================
// PRICING STRATEGY PATTERN
// =============================================================================
// Each tab (wine-btg, wine-btb, spirits, beer, na) can use a different pricing
// strategy. Strategies are pluggable — a new strategy (like AI-driven dynamic
// pricing) can be added without touching the UI or existing strategies.
//
// Contract:
//   - Input:  item cost, context (tab, pour size, historical data if any)
//   - Output: suggested price + reasoning + confidence
//
// Current strategies:
//   1. FlatPercentStrategy  — single target %, what we have today
//   2. TieredStrategy       — target % changes with cost bucket (Keller-style)
//   3. HybridStrategy       — tiered + smart rounding (Keller + behavioral)
//
// Future (when Toast/POS API is connected):
//   4. AIStrategy           — sales velocity + rules + optimization
// =============================================================================

import type { BeverageTabKey } from "./beverage-pricing-defaults";

// ---------- Input / Output ----------

export interface PricingInput {
  costCents: number;              // bottle cost × pour/volume ratio, already computed
  tab: BeverageTabKey;
  pourLabel?: string;             // "5oz", "8oz", "btl" etc.
  itemBottleCostCents?: number;   // whole-bottle purchase cost (for tier lookup)
  // future additions:
  //   salesVelocity?: number
  //   categoryAvgPriceCents?: number
  //   historicalStatus?: "hot" | "cold" | "dormant"
}

export interface PricingOutput {
  suggestedCents: number;         // final rounded price
  targetPct: number;              // effective cost % after all rules
  confidence: number;             // 0–100 (how sure the strategy is)
  reasoning: string[];            // human-readable explanation
  appliedRoundingRule?: string;   // e.g. "rounded up to nearest $5"
}

// ---------- Strategy interface ----------

export interface PricingStrategy {
  readonly type: StrategyType;
  readonly displayName: string;
  suggestPrice(input: PricingInput): PricingOutput;
}

export type StrategyType = "flat" | "tiered" | "hybrid" | "ai-dynamic";

// ---------- Tier model (shared by tiered / hybrid) ----------

export interface CostTier {
  minCents: number;               // inclusive
  maxCents: number | null;        // exclusive; null = unlimited (top tier)
  targetPct: number;
  label?: string;                 // optional human label e.g. "mid-range"
}

export const DEFAULT_TIERS_BY_TAB: Record<BeverageTabKey, CostTier[]> = {
  "wine-btb": [
    { minCents: 0, maxCents: 1500, targetPct: 22, label: "Entry" },
    { minCents: 1500, maxCents: 3500, targetPct: 28, label: "House" },
    { minCents: 3500, maxCents: 7500, targetPct: 33, label: "Premium" },
    { minCents: 7500, maxCents: 15000, targetPct: 40, label: "Reserve" },
    { minCents: 15000, maxCents: null, targetPct: 50, label: "Prestige" },
  ],
  "wine-btg": [
    { minCents: 0, maxCents: 1500, targetPct: 18, label: "Entry" },
    { minCents: 1500, maxCents: 3000, targetPct: 22, label: "House" },
    { minCents: 3000, maxCents: null, targetPct: 28, label: "Premium" },
  ],
  // Wine Half Bottle — calibrated from Meyhouse data:
  //   Frog's Leap half $24 cost → $81 menu (29.6% cost / 3.38x markup)
  //   Accendo half $139 cost → $287 menu (48.4% cost / 2.06x markup)
  // Sweet spot: $65-95 retail → need aggressive markup on cheap halves,
  // gentler markup on expensive halves (so prestige bottles stay sellable as anchors).
  "wine-half": [
    { minCents: 0, maxCents: 1500, targetPct: 28, label: "Entry" },      // ~3.5x
    { minCents: 1500, maxCents: 2500, targetPct: 30, label: "Sweet spot" }, // ~3.3x → matches Frog's Leap
    { minCents: 2500, maxCents: 4000, targetPct: 33, label: "Core" },    // ~3.0x
    { minCents: 4000, maxCents: 6000, targetPct: 38, label: "Premium" }, // ~2.6x
    { minCents: 6000, maxCents: 10000, targetPct: 45, label: "Upper" },  // ~2.2x
    { minCents: 10000, maxCents: null, targetPct: 50, label: "Prestige" }, // ~2.0x → matches Accendo
  ],
  spirits: [
    { minCents: 0, maxCents: 2000, targetPct: 18, label: "Well" },
    { minCents: 2000, maxCents: 5000, targetPct: 22, label: "Call" },
    { minCents: 5000, maxCents: 10000, targetPct: 26, label: "Premium" },
    { minCents: 10000, maxCents: null, targetPct: 32, label: "Top-shelf" },
  ],
  beer: [
    { minCents: 0, maxCents: 500, targetPct: 20 },
    { minCents: 500, maxCents: null, targetPct: 25 },
  ],
  na: [
    { minCents: 0, maxCents: null, targetPct: 18 },
  ],
};

function resolveTier(tiers: CostTier[], costCents: number): CostTier {
  for (const t of tiers) {
    if (costCents >= t.minCents && (t.maxCents === null || costCents < t.maxCents)) {
      return t;
    }
  }
  // Fallback: return last tier
  return tiers[tiers.length - 1];
}

// ---------- Rounding helpers ----------

export type RoundingMode = "none" | "nearest-5" | "nearest-10" | "charm-99";

export function applyRounding(cents: number, mode: RoundingMode): { cents: number; rule: string } {
  switch (mode) {
    case "nearest-5": {
      // round to nearest $5 (500 cents)
      const rounded = Math.round(cents / 500) * 500;
      return { cents: rounded, rule: `rounded to nearest $5 ($${(rounded / 100).toFixed(0)})` };
    }
    case "nearest-10": {
      const rounded = Math.round(cents / 1000) * 1000;
      return { cents: rounded, rule: `rounded to nearest $10 ($${(rounded / 100).toFixed(0)})` };
    }
    case "charm-99": {
      // e.g. 6500 → 6499 (e.g. $65 → $64.99)
      const dollars = Math.floor(cents / 100);
      const charm = dollars * 100 + 99 - 100; // one dollar below with .99 ending
      return { cents: Math.max(99, charm), rule: `charm pricing (.99 ending)` };
    }
    default:
      return { cents, rule: "no rounding" };
  }
}

// ---------- STRATEGIES ----------

export class FlatPercentStrategy implements PricingStrategy {
  readonly type = "flat" as const;
  readonly displayName = "Flat percentage";

  constructor(private targetPct: number) {}

  suggestPrice(input: PricingInput): PricingOutput {
    if (input.costCents <= 0 || this.targetPct <= 0) {
      return {
        suggestedCents: 0,
        targetPct: this.targetPct,
        confidence: 0,
        reasoning: ["Cannot compute: missing cost or target"],
      };
    }
    const raw = Math.round(input.costCents / (this.targetPct / 100));
    const rounded = Math.round(raw / 50) * 50; // default $0.50 step
    return {
      suggestedCents: rounded,
      targetPct: this.targetPct,
      confidence: 70,
      reasoning: [`Flat ${this.targetPct}% target`, `Cost $${(input.costCents / 100).toFixed(2)} ÷ ${this.targetPct}%`],
    };
  }
}

export class TieredStrategy implements PricingStrategy {
  readonly type = "tiered" as const;
  readonly displayName = "Tiered by cost";

  constructor(private tiers: CostTier[]) {}

  suggestPrice(input: PricingInput): PricingOutput {
    // For wine/spirits tabs, tier decision is based on whole-BOTTLE cost
    // (not pour cost), so that all pour sizes of one bottle share the same target.
    // For non-bottle tabs we fall back to pour cost.
    const costForTier = input.itemBottleCostCents ?? input.costCents;
    if (costForTier <= 0) {
      return {
        suggestedCents: 0,
        targetPct: 0,
        confidence: 0,
        reasoning: ["Cannot compute: no cost"],
      };
    }
    const tier = resolveTier(this.tiers, costForTier);
    const raw = Math.round(input.costCents / (tier.targetPct / 100));
    const rounded = Math.round(raw / 50) * 50;
    return {
      suggestedCents: rounded,
      targetPct: tier.targetPct,
      confidence: 75,
      reasoning: [
        `Tier ${tier.label ?? "$" + (tier.minCents / 100).toFixed(0) + "+"} → ${tier.targetPct}%`,
        `Bottle cost $${(costForTier / 100).toFixed(2)}`,
      ],
    };
  }
}

export class HybridStrategy implements PricingStrategy {
  readonly type = "hybrid" as const;
  readonly displayName = "Tiered + smart rounding";

  constructor(private tiers: CostTier[], private rounding: RoundingMode = "nearest-5") {}

  suggestPrice(input: PricingInput): PricingOutput {
    const costForTier = input.itemBottleCostCents ?? input.costCents;
    if (costForTier <= 0) {
      return {
        suggestedCents: 0,
        targetPct: 0,
        confidence: 0,
        reasoning: ["Cannot compute: no cost"],
      };
    }
    const tier = resolveTier(this.tiers, costForTier);
    const raw = Math.round(input.costCents / (tier.targetPct / 100));
    const { cents: rounded, rule } = applyRounding(raw, this.rounding);
    return {
      suggestedCents: rounded,
      targetPct: tier.targetPct,
      confidence: 85,
      reasoning: [
        `Tier ${tier.label ?? "$" + (tier.minCents / 100).toFixed(0) + "+"} → ${tier.targetPct}%`,
        `Bottle cost $${(costForTier / 100).toFixed(2)} × ${(100 / tier.targetPct).toFixed(2)}x = $${(raw / 100).toFixed(2)}`,
        rule,
      ],
      appliedRoundingRule: rule,
    };
  }
}

// =============================================================================
// Config → Strategy factory
// =============================================================================

export interface StrategyConfig {
  type: StrategyType;
  // For "flat"
  flatTargetPct?: number;
  // For "tiered" / "hybrid"
  tiers?: CostTier[];
  // For "hybrid"
  rounding?: RoundingMode;
}

export function createStrategy(
  cfg: StrategyConfig,
  fallbackTabDefault: number,
  tab: BeverageTabKey
): PricingStrategy {
  switch (cfg.type) {
    case "flat":
      return new FlatPercentStrategy(cfg.flatTargetPct ?? fallbackTabDefault);
    case "tiered":
      return new TieredStrategy(cfg.tiers ?? DEFAULT_TIERS_BY_TAB[tab]);
    case "hybrid":
      return new HybridStrategy(
        cfg.tiers ?? DEFAULT_TIERS_BY_TAB[tab],
        cfg.rounding ?? "nearest-5"
      );
    case "ai-dynamic":
      // TODO: implement when POS/Toast API is wired up
      // Fallback to hybrid for now
      return new HybridStrategy(cfg.tiers ?? DEFAULT_TIERS_BY_TAB[tab], cfg.rounding ?? "nearest-5");
    default:
      return new FlatPercentStrategy(fallbackTabDefault);
  }
}

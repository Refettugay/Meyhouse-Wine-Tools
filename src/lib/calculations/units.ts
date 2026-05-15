export const OZ_TO_ML = 29.5735;
export const DASH_TO_OZ = 0.02;
export const DASH_TO_ML = 0.6;
export const BARSPOON_TO_OZ = 0.125;

export function ozToMl(oz: number): number {
  return Math.round(oz * OZ_TO_ML * 100) / 100;
}

export function mlToOz(ml: number): number {
  return Math.round((ml / OZ_TO_ML) * 100) / 100;
}

export function dashesToOz(dashes: number): number {
  return dashes * DASH_TO_OZ;
}

export function ozToDashes(oz: number): number {
  return Math.round(oz / DASH_TO_OZ);
}

export function dashesToMl(dashes: number): number {
  return dashes * DASH_TO_ML;
}

export function toOz(amount: number, unit: string): number {
  switch (unit) {
    case "OZ":
      return amount;
    case "ML":
      return mlToOz(amount);
    case "DASH":
      return dashesToOz(amount);
    case "BARSPOON":
      return amount * BARSPOON_TO_OZ;
    default:
      return amount;
  }
}

export function formatUnit(unit: string): string {
  const map: Record<string, string> = {
    OZ: "oz",
    ML: "ml",
    DASH: "dash",
    BARSPOON: "barspoon",
    EACH: "ea",
    DROP: "drop",
    SPLASH: "splash",
    RINSE: "rinse",
    TOPOFF: "top off",
  };
  return map[unit] || unit.toLowerCase();
}

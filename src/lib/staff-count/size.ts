// Bottle / container size label for the staff count page — same wording as the
// admin Product Hub (e.g. "750ml", "1L", "375ml", "Sixth Keg (5.16gal)", "5lb").
const NAMED_ML: Record<number, string> = {
  148: "5oz (148ml)",
  296: "10oz",
  325: "11oz",
  330: "330ml",
  355: "355ml (12oz)",
  473: "473ml (16oz)",
  532: "18oz",
  562: "19oz",
  591: "20oz",
  1893: "64oz",
  4997: "Mini Keg (1.32gal)",
  19533: "Sixth Keg (5.16gal)",
  29337: "Quarter Keg (7.75gal)",
  58674: "Half Barrel (15.5gal)",
};

export function formatBottleSize(value: number | null | undefined, unit: string | null | undefined): string | null {
  if (!value || value <= 0) return null;
  switch (unit) {
    case "g":
      return value >= 1000 ? `${+(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}kg` : `${value}g`;
    case "kg":
      return `${value}kg`;
    case "lb":
      return Number.isInteger(value) ? `${value}lb` : `${value.toFixed(1)}lb`;
    case "gal":
      return `${value}gal`;
    case "oz":
    case "solid_oz":
      return `${value}oz`;
  }
  if (NAMED_ML[value]) return NAMED_ML[value];
  if (value >= 3785) return `${(value / 3785).toFixed(2)}gal`;
  if (value >= 1000) return `${+(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}L`;
  return `${value}ml`;
}

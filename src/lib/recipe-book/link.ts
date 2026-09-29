// The ONE staff Recipe Book link for the whole group (beverage.bar_recipe_link,
// single row id = 1). Server-only.
import { prisma } from "@/lib/db";

export function isTokenShape(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(token);
}

export async function recipeLinkActive(token: string): Promise<boolean> {
  if (!isTokenShape(token)) return false;
  const link = await prisma.barRecipeLink.findUnique({ where: { id: 1 }, select: { token: true, enabled: true } });
  return !!link && link.enabled && link.token === token;
}

// Resolve a staff count-page link token to its store. Server-only.
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

export type CountLinkStore = {
  locationId: string;
  organizationId: string;
  name: string;
  scheduleLocationId: string | null;
};

export async function resolveCountLink(token: string): Promise<CountLinkStore | null> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const link = await prisma.orderCountLink.findUnique({
    where: { token },
    select: {
      enabled: true,
      location: { select: { id: true, organizationId: true, name: true, scheduleLocationId: true } },
    },
  });
  if (!link || !link.enabled) return null;
  return {
    locationId: link.location.id,
    organizationId: link.location.organizationId,
    name: link.location.name,
    scheduleLocationId: link.location.scheduleLocationId,
  };
}

export function newCountToken(): string {
  return randomBytes(18).toString("base64url"); // 24 chars, URL-safe
}

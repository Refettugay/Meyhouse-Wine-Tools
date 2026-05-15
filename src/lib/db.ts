import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Use the Supabase Postgres connection. In production this points at the
// shared Sophra Supabase project (with ?schema=beverage&pgbouncer=true on
// the pooler URL). Locally, the same URL can be used — the `beverage`
// schema isolates Beverage data from Schedule's `public` schema.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Signed-in staff person on the count page. Server-only.
//
// After name + PIN, the server sets an httpOnly cookie scoped to this store's
// link path (/count/<token>), signed with an HMAC key derived from
// SUPABASE_SERVICE_ROLE_KEY. It carries only who, which store, and when it
// expires. Rotating the link changes the path and the token hash, so old
// sessions stop working.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "sophra_count";
const SESSION_HOURS = 8;

export type StaffSession = { personId: string; name: string; locationId: string };

function key(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("staff-count: SUPABASE_SERVICE_ROLE_KEY is not set.");
  return createHmac("sha256", "sophra-staff-count-session-v1").update(secret).digest();
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("base64url").slice(0, 16);
}

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

export async function setStaffSession(token: string, s: StaffSession) {
  const payload = Buffer.from(
    JSON.stringify({ p: s.personId, n: s.name, l: s.locationId, t: tokenHash(token), e: Date.now() + SESSION_HOURS * 3600_000 }),
  ).toString("base64url");
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/count/${token}`,
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function clearStaffSession(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, "", { path: `/count/${token}`, maxAge: 0 });
}

export async function getStaffSession(token: string, locationId: string): Promise<StaffSession | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      p: string; n: string; l: string; t: string; e: number;
    };
    if (d.e < Date.now() || d.l !== locationId || d.t !== tokenHash(token)) return null;
    return { personId: d.p, name: d.n, locationId: d.l };
  } catch {
    return null;
  }
}

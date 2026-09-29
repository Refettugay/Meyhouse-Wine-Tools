// Signed-in person on the staff Recipe Book page. Server-only.
//
// Same pattern as the count page (src/lib/staff-count/session.ts): after a PIN
// sign-in the server sets an httpOnly cookie scoped to the link path
// (/bar/<token>), HMAC-signed with a key derived from SUPABASE_SERVICE_ROLE_KEY.
// It carries only who and when it expires. Making a new link changes the path
// and the token hash, so old sessions stop working. Access is re-checked on
// every request anyway (see access.ts).

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "sophra_bar";
const SESSION_HOURS = 8;

export type BarSession = { personId: string; name: string };

function key(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("recipe-book: SUPABASE_SERVICE_ROLE_KEY is not set.");
  return createHmac("sha256", "sophra-bar-recipe-session-v1").update(secret).digest();
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("base64url").slice(0, 16);
}

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

export async function setBarSession(token: string, s: BarSession) {
  const payload = Buffer.from(
    JSON.stringify({ p: s.personId, n: s.name, t: tokenHash(token), e: Date.now() + SESSION_HOURS * 3600_000 }),
  ).toString("base64url");
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/bar/${token}`,
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function clearBarSession(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, "", { path: `/bar/${token}`, maxAge: 0 });
}

export async function getBarSession(token: string): Promise<BarSession | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { p: string; n: string; t: string; e: number };
    if (d.e < Date.now() || d.t !== tokenHash(token)) return null;
    return { personId: d.p, name: d.n };
  } catch {
    return null;
  }
}

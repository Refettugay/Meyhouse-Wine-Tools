// Staff PINs for the staff count page. Server-only.
//
// COPIED from the launcher's Tip Entry (runsophra-launcher src/lib/tip-pin.ts +
// tip-pin-store.ts, origin/main dec547e) so both apps share ONE PIN per person
// (public.person_pins). The hashing MUST stay byte-for-byte identical — same
// scrypt params and the same pepper label — or existing PINs stop matching.
// The pepper comes from SUPABASE_SERVICE_ROLE_KEY, so this app needs the SAME
// value as the launcher in its Vercel env.
//
// First-time setup goes through the launcher's SQL function tip_pin_write (which
// also writes its audit log), called here through Prisma (the app's postgres
// role). PIN checks here never use the lockout (see checkPin).

import { createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "@/lib/db";

const scryptAsync = promisify(scrypt) as (
  password: Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 32;

export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4}$/.test(pin);
}

// The key must be THIS project's service-role key. A wrong key would make every
// PIN look wrong — and five misses would lock the person out of My Tips too —
// so if it's a JWT for another project/role, treat the page as not set up.
export function pinConfigured(): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return false;
  const parts = key.split(".");
  if (parts.length !== 3) return true; // non-JWT secret key format — can't inspect
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: string; ref?: string };
    return claims.role === "service_role" && (!claims.ref || claims.ref === "rcigqnzxikslmswszqvo");
  } catch {
    return false;
  }
}

function pepperedPin(pin: string): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("staff-pin: SUPABASE_SERVICE_ROLE_KEY is not set.");
  const pepper = createHmac("sha256", "sophra-tip-pin-pepper-v1").update(secret).digest();
  return createHmac("sha256", pepper).update(pin).digest();
}

function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(pepperedPin(pin), salt, KEY_LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPinAsync(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scryptAsync(pepperedPin(pin), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export type PinCheck =
  | { ok: true }
  | { ok: false; error: "not_set" | "bad_format" | "wrong" };

// Tap a name + type a PIN. The count page has NO lockout (Refet, 2026-09-28):
// unlimited tries, nobody is ever locked out, and wrong tries here do NOT touch
// person_pins' attempt counter — so they never count toward the My Tips lockout.
// A wrong PIN just answers ~1s later, to slow down guessing.
// Who may count is decided by "Staff ordering (count page)" (see the roster in
// app/count/[token]/actions.ts); Tip Entry's access switch is about tips only.
export async function checkPin(personId: string, pin: unknown): Promise<PinCheck> {
  if (!isValidPinFormat(pin)) return { ok: false, error: "bad_format" };
  const rows = await prisma.$queryRaw<{ pin_hash: string | null }[]>`
    select pin_hash from public.person_pins where person_id = ${personId}::uuid`;
  const r = rows[0];
  if (!r || !r.pin_hash) return { ok: false, error: "not_set" };
  if (await verifyPinAsync(pin, r.pin_hash)) return { ok: true };
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return { ok: false, error: "wrong" };
}

// PINs are universal (one per person) and must be unique across people, because
// the Tip Entry kiosk identifies WHO typed a PIN by scanning every holder.
async function isPinTaken(pin: string, excludePersonId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ pin_hash: string }[]>`
    select pin_hash from public.person_pins
    where pin_hash is not null and person_id <> ${excludePersonId}::uuid`;
  const matches = await Promise.all(rows.map((r) => verifyPinAsync(pin, r.pin_hash)));
  return matches.some(Boolean);
}

export type PinWrite = { ok: true } | { ok: false; error: "already_set" | "taken" | "bad_input" | "db_error" };

// First-time PIN by the person themselves. Refused if a PIN already exists
// (tip_pin_write 'self_set'), which also writes public.person_pin_log.
export async function setInitialPin(personId: string, pin: string, actorName: string): Promise<PinWrite> {
  if (!isValidPinFormat(pin)) return { ok: false, error: "bad_input" };
  if (await isPinTaken(pin, personId)) return { ok: false, error: "taken" };
  const hash = hashPin(pin);
  const rows = await prisma.$queryRaw<{ r: { ok: boolean; error?: string } }[]>`
    select public.tip_pin_write(${personId}::uuid, 'self_set', ${hash}, ${personId}::uuid, ${actorName}, true) as r`;
  const r = rows[0]?.r;
  if (r?.ok) return { ok: true };
  if (r?.error === "already_set") return { ok: false, error: "already_set" };
  return { ok: false, error: "db_error" };
}

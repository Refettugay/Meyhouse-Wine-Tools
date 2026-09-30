// Drink photos in the private "bar-recipe-photos" bucket. Server-only.
// The device shrinks the photo (max ~900 px JPEG) and a ~200 px thumbnail
// before upload. Files are never deleted: history and revert point at old ones.
// The page only ever gets short-lived signed URLs, after the access check.

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "bar-recipe-photos";
const SIGNED_SECONDS = 60 * 60 * 6; // one shift

export const thumbPathOf = (path: string) => path.replace(/\.jpg$/, "_t.jpg");

function jpegBytes(b64: string, maxBytes: number): Buffer | null {
  if (typeof b64 !== "string" || b64.length > maxBytes * 1.4) return null;
  const buf = Buffer.from(b64, "base64");
  // JPEG magic number FF D8 FF
  if (buf.length < 100 || buf.length > maxBytes || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  return buf;
}

// Returns the stored path ("<recipe>/<uuid>.jpg"), or null if the data is not a small JPEG.
export async function uploadPhoto(recipeId: string, fullB64: string, thumbB64: string): Promise<string | null> {
  const full = jpegBytes(fullB64, 1_500_000);
  const thumb = jpegBytes(thumbB64, 200_000);
  if (!full || !thumb) return null;
  const path = `${recipeId}/${randomUUID()}.jpg`;
  const storage = createAdminClient().storage.from(BUCKET);
  const a = await storage.upload(path, full, { contentType: "image/jpeg", upsert: false });
  if (a.error) throw new Error(`photo upload: ${a.error.message}`);
  const b = await storage.upload(thumbPathOf(path), thumb, { contentType: "image/jpeg", upsert: false });
  if (b.error) throw new Error(`thumb upload: ${b.error.message}`);
  return path;
}

// path -> signed URL for every path given (full photos and/or thumbnails).
export async function signPhotos(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  try {
    const { data } = await createAdminClient().storage.from(BUCKET).createSignedUrls(unique, SIGNED_SECONDS);
    for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  } catch {
    // photos are optional — never block recipes
  }
  return out;
}

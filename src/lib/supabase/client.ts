import { createBrowserClient } from "@supabase/ssr";

const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;

// SINGLETON: cache the client at module scope. Without this, every
// component that calls createClient() got its own browser client with
// its own auto-refresh timer. When the access token expired, every
// client tried to refresh the SAME refresh token; Supabase rotates on
// the first success and rejects every other with
// `refresh_token_already_used`. The library retries immediately with no
// real backoff, so the rejected clients pounded /auth/v1/token until
// Supabase's per-IP rate limit kicked in (HTTP 429). Caching to ONE
// instance per browser tab eliminates the inter-client race entirely.
//
// See memory/project_auth_bug.md for the full diagnosis.

type BrowserClient = ReturnType<typeof createBrowserClient>;

let cached: BrowserClient | null = null;

export function createClient() {
  if (cached) return cached;

  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    cookieDomain
      ? {
          cookieOptions: {
            domain: cookieDomain,
            path: "/",
            sameSite: "lax",
            secure: true,
          },
        }
      : undefined,
  );
  return cached;
}

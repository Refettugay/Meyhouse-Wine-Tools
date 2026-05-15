import { createBrowserClient } from "@supabase/ssr";

const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;

export function createClient() {
  return createBrowserClient(
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
}

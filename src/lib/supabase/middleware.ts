import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const cookieDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(cookieDomain
        ? {
            cookieOptions: {
              domain: cookieDomain,
              path: "/",
              sameSite: "lax",
              secure: true,
            },
          }
        : {}),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              ...(cookieDomain ? { domain: cookieDomain } : {}),
            }),
          );
        },
      },
    },
  );

  const { data: { user }, error } = await supabase.auth.getUser();

  // Supabase rotates the refresh token on every refresh. Two concurrent
  // requests racing to refresh the same token (rapid clicks, multi-tab,
  // prefetch) cause one to win and the other to fail with
  // `Invalid Refresh Token: Already Used`. The user is STILL authenticated
  // — the winning request set the new tokens on its own response. Don't
  // bounce them to /login: that triggers a login retry, burns through
  // Supabase's per-IP auth rate limit, and locks them out for ~30 min.
  // See memory/project_auth_bug.md for the full diagnosis. proxy.ts reads
  // this flag and skips its redirect-to-launcher branch when set.
  const isRotationRace = !!error && (
    /already[\s_]?used/i.test(error.message ?? "") ||
    /refresh[\s_]?token[\s_]?already[\s_]?used/i.test(
      (error as { code?: string }).code ?? "",
    )
  );

  return { response: supabaseResponse, supabase, user, isRotationRace };
}

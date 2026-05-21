import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const LAUNCHER_URL =
  process.env.NEXT_PUBLIC_LAUNCHER_URL || "https://app.runsophra.com";
const SCHEDULE_URL =
  process.env.NEXT_PUBLIC_SCHEDULE_URL || "https://schedule.runsophra.com";

const ALLOWED_ROLES = new Set(["owner", "manager", "supervisor"]);

export async function proxy(request: NextRequest) {
  const { response, supabase, user, isRotationRace } = await updateSession(
    request,
  );

  // Token rotation race (see updateSession's comment): user IS signed in,
  // just lost the refresh race on this request. Let the request through —
  // the next click will have fresh cookies. Bouncing to /login here was
  // the cause of the "random logout + rate-limit lockout" bug.
  if (isRotationRace) {
    return response;
  }

  // No session → bounce to launcher's login. The launcher will route the
  // user back to Beverage (or wherever) after a successful sign-in.
  if (!user) {
    return NextResponse.redirect(`${LAUNCHER_URL}/login`);
  }

  // Authenticated. Look up the user's role from Schedule's profiles
  // table on every request. profiles is small (one row per Meyhouse
  // employee) and Supabase reads are fast; this avoids drift if a role
  // changes mid-session.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();

  if (!profile || !ALLOWED_ROLES.has(profile.role)) {
    return NextResponse.redirect(`${SCHEDULE_URL}/my-shifts`);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

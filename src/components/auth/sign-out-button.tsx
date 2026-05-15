"use client";

import { createClient } from "@/lib/supabase/client";

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL || "https://runsophra.com";

export function SignOutButton() {
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Cookies scoped to .runsophra.com are now cleared across all three
    // Sophra apps; landing on the marketing site is the unified exit point.
    window.location.href = MARKETING_URL;
  }

  return (
    <button
      onClick={handleSignOut}
      className="w-full py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-600 font-medium rounded-lg border border-red-600/20 transition-colors"
    >
      Sign Out
    </button>
  );
}

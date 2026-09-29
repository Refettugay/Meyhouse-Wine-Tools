import type { Metadata, Viewport } from "next";
import { resolveCountLink } from "@/lib/staff-count/link";
import { StaffCountApp } from "./staff-count-app";

// Staff count page — reached only through a store's secret link
// (/count/<token>). No Sophra login: staff sign in with name + PIN.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Count",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // no auto-zoom when a count box is tapped
  themeColor: "#F5EFE3",
};

export default async function CountPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const store = await resolveCountLink(token);
  if (!store) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--brand-cream)] px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-medium text-[var(--brand-brown)] mb-2">This link isn&rsquo;t active</h1>
          <p className="text-sm text-[var(--ink-muted)]">Ask your manager for the current count link.</p>
        </div>
      </main>
    );
  }
  return <StaffCountApp token={token} storeName={store.name.replace("Meyhouse ", "")} />;
}

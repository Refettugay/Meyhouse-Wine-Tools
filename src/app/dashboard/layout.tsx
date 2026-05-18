import { requireAuth } from "@/lib/session";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  return (
    <div
      className="min-h-screen"
      style={{
        background: "var(--brand-cream)",
        color: "var(--brand-brown)",
      }}
    >
      {/* Desktop sidebar */}
      <Sidebar
        organizationName={session.organizationName}
        userName={session.userName}
        role={session.role}
        permissions={session.permissions}
      />

      {/* Main content — always pl-16 to match collapsed sidebar */}
      <div className="pl-16">
        <main>{children}</main>
      </div>
    </div>
  );
}

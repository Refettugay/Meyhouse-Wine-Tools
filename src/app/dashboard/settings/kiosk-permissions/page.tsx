import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { loadKioskPeople } from "@/lib/actions/kiosk-permissions";
import { KioskPermissionsList } from "@/components/settings/kiosk-permissions-list";

// Admin → Settings → Kiosk permissions (KIOSK_SWIPE_ACTIONS).
export default async function KioskPermissionsPage() {
  const { canEdit, people } = await loadKioskPeople();
  return (
    <div className="p-4 lg:p-8 max-w-2xl">
      <Link href="/dashboard/settings" className="inline-flex items-center gap-1 text-sm text-[var(--ink-muted)] hover:text-[var(--brand-brown)] mb-4">
        <ArrowLeft className="w-4 h-4" /> Settings
      </Link>
      <h1 className="text-2xl font-bold mb-1">Kiosk permissions</h1>
      <p className="text-sm text-[var(--ink-muted)] mb-6">
        Who can mark an item <b>86</b> (completely out) on the staff ordering kiosk. Owners, managers and supervisors start
        with it on. Everyone listed has &ldquo;Staff ordering&rdquo; switched on in the Team app.
      </p>
      <KioskPermissionsList people={people} canEdit={canEdit} />
    </div>
  );
}

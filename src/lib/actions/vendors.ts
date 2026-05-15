"use server";

import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { revalidatePath } from "next/cache";

// ===== VENDORS =====

export async function createVendor(data: {
  name: string;
  notes?: string;
}) {
  const orgId = await getOrganizationId();
  if (!data.name.trim()) return { error: "Name is required" };

  const existing = await prisma.vendor.findUnique({
    where: { organizationId_name: { organizationId: orgId, name: data.name.trim() } },
  });
  if (existing) return { error: "A vendor with this name already exists" };

  const vendor = await prisma.vendor.create({
    data: {
      organizationId: orgId,
      name: data.name.trim(),
      notes: data.notes || null,
    },
  });

  revalidatePath("/dashboard/vendors");
  revalidatePath("/dashboard/products");
  return { success: true, vendor };
}

export async function updateVendor(
  id: string,
  data: { name: string; notes?: string }
) {
  const orgId = await getOrganizationId();
  await prisma.vendor.update({
    where: { id, organizationId: orgId },
    data: {
      name: data.name.trim(),
      notes: data.notes || null,
    },
  });
  revalidatePath("/dashboard/vendors");
  return { success: true };
}

export async function deleteVendor(id: string) {
  const orgId = await getOrganizationId();
  await prisma.vendor.delete({
    where: { id, organizationId: orgId },
  });
  revalidatePath("/dashboard/vendors");
}

// ===== VENDOR REPS =====

export async function createVendorRep(data: {
  vendorId: string;
  name: string;
  email?: string;
  phone?: string;
  locationIds: string[];
}) {
  const orgId = await getOrganizationId();
  if (!data.name.trim()) return { error: "Name is required" };

  // Verify vendor belongs to org
  const vendor = await prisma.vendor.findFirst({
    where: { id: data.vendorId, organizationId: orgId },
  });
  if (!vendor) return { error: "Vendor not found" };

  const rep = await prisma.vendorRep.create({
    data: {
      vendorId: data.vendorId,
      name: data.name.trim(),
      email: data.email || null,
      phone: data.phone || null,
      locations: {
        create: data.locationIds.map((locationId) => ({ locationId })),
      },
    },
  });

  revalidatePath("/dashboard/vendors");
  return { success: true, rep };
}

export async function updateVendorRep(
  id: string,
  data: {
    name: string;
    email?: string;
    phone?: string;
    locationIds: string[];
  }
) {
  const orgId = await getOrganizationId();

  const rep = await prisma.vendorRep.findFirst({
    where: {
      id,
      vendor: { organizationId: orgId },
    },
  });
  if (!rep) return { error: "Not found" };

  // Delete existing location links and recreate
  await prisma.vendorRepLocation.deleteMany({ where: { vendorRepId: id } });

  await prisma.vendorRep.update({
    where: { id },
    data: {
      name: data.name.trim(),
      email: data.email || null,
      phone: data.phone || null,
      locations: {
        create: data.locationIds.map((locationId) => ({ locationId })),
      },
    },
  });

  revalidatePath("/dashboard/vendors");
  return { success: true };
}

export async function deleteVendorRep(id: string) {
  const orgId = await getOrganizationId();
  const rep = await prisma.vendorRep.findFirst({
    where: { id, vendor: { organizationId: orgId } },
  });
  if (!rep) return;

  await prisma.vendorRep.delete({ where: { id } });
  revalidatePath("/dashboard/vendors");
}

"use server";

import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { parseOpenTableCovers, type CoverDayRow } from "@/lib/covers/opentable-parser";

// ---------- Types shared with client ----------

export interface CoversPreview {
  locationName: string | null;
  locationId: string | null;
  periodStart: string; // YYYY-MM-DD (earliest date in file)
  periodEnd: string; // YYYY-MM-DD (latest date in file)
  totalCovers: number;
  totalReservations: number;
  excludedRows: number;
  lunchCovers: number;
  dinnerCovers: number;
  dayCount: number;
  days: CoverDayRow[];
}

// ---------- Public actions ----------

/**
 * Parse an OpenTable Reservations CSV and return a dry-run preview.
 * Does NOT save to DB. Only aggregate covers are read — guest names/phones ignored.
 */
export async function previewCoversUpload(
  csvContent: string,
  locationId: string | null
): Promise<CoversPreview> {
  const orgId = await getOrganizationId();

  const parsed = parseOpenTableCovers(csvContent);
  if (parsed.days.length === 0 || parsed.minDate === null) {
    throw new Error(
      "No attended reservations found in this file. Make sure it's an OpenTable 'Reservations' export."
    );
  }

  let locationName: string | null = null;
  if (locationId) {
    const loc = await prisma.location.findFirst({
      where: { id: locationId, organizationId: orgId },
      select: { name: true },
    });
    locationName = loc?.name ?? null;
  }

  const lunchCovers = parsed.days
    .filter((d) => d.service === "lunch")
    .reduce((s, d) => s + d.covers, 0);
  const dinnerCovers = parsed.days
    .filter((d) => d.service === "dinner")
    .reduce((s, d) => s + d.covers, 0);

  return {
    locationName,
    locationId,
    periodStart: parsed.minDate,
    periodEnd: parsed.maxDate ?? parsed.minDate,
    totalCovers: parsed.totalCovers,
    totalReservations: parsed.totalReservations,
    excludedRows: parsed.excludedRows,
    lunchCovers,
    dinnerCovers,
    dayCount: new Set(parsed.days.map((d) => d.date)).size,
    days: parsed.days,
  };
}

/**
 * Save a covers snapshot (per-day + per-service rows) to the DB.
 */
export async function saveCoversSnapshot(
  locationId: string | null,
  periodStart: string,
  periodEnd: string,
  sourceFilename: string | null,
  days: CoverDayRow[],
  replaceExisting: boolean = false
) {
  try {
    const orgId = await getOrganizationId();

    if (locationId) {
      const loc = await prisma.location.findFirst({
        where: { id: locationId, organizationId: orgId },
        select: { id: true },
      });
      if (!loc) return { error: "Location not found in your organization" };
    }

    const pStart = new Date(periodStart);
    const pEnd = new Date(periodEnd);

    // ---- Duplicate-upload guard ----
    const existing = await prisma.coverSnapshot.findFirst({
      where: {
        organizationId: orgId,
        locationId: locationId || null,
        periodStart: pStart,
        periodEnd: pEnd,
      },
      select: { id: true, createdAt: true, sourceFilename: true },
    });

    if (existing && !replaceExisting) {
      return {
        duplicate: true,
        existingId: existing.id,
        existingCreatedAt: existing.createdAt.toISOString(),
        existingFilename: existing.sourceFilename,
      };
    }

    if (existing && replaceExisting) {
      await prisma.coverSnapshot.delete({ where: { id: existing.id } });
    }

    const totalCovers = days.reduce((s, d) => s + d.covers, 0);
    const totalReservations = days.reduce((s, d) => s + d.reservations, 0);

    const snapshot = await prisma.coverSnapshot.create({
      data: {
        organizationId: orgId,
        locationId: locationId || null,
        periodStart: pStart,
        periodEnd: pEnd,
        source: "OPENTABLE_CSV",
        sourceFilename,
        totalCovers,
        totalReservations,
      },
    });

    await prisma.coverDay.createMany({
      data: days.map((d) => ({
        snapshotId: snapshot.id,
        date: new Date(d.date),
        service: d.service,
        covers: d.covers,
        reservations: d.reservations,
      })),
    });

    revalidatePath("/dashboard/pricing-hub/covers");
    return { success: true, snapshotId: snapshot.id, replaced: !!existing };
  } catch (err) {
    console.error("[saveCoversSnapshot] failed:", err);
    return {
      error:
        "Could not save the covers snapshot. Please try again; if it keeps happening, note the location and period and report it.",
    };
  }
}

export async function listCoverSnapshots() {
  const orgId = await getOrganizationId();
  return prisma.coverSnapshot.findMany({
    where: { organizationId: orgId },
    include: { location: { select: { id: true, name: true } } },
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
  });
}

export async function deleteCoverSnapshot(id: string) {
  const orgId = await getOrganizationId();
  const snapshot = await prisma.coverSnapshot.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true },
  });
  if (!snapshot) return { error: "Snapshot not found" };
  await prisma.coverSnapshot.delete({ where: { id } });
  revalidatePath("/dashboard/pricing-hub/covers");
  return { success: true };
}

export async function getLocationsForCovers() {
  const orgId = await getOrganizationId();
  return prisma.location.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

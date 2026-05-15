"use server";

import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type CostingMethod = "WAC" | "FIFO" | "LIFO";

export async function updateCostingMethod(method: CostingMethod) {
  const orgId = await getOrganizationId();
  if (!["WAC", "FIFO", "LIFO"].includes(method)) {
    return { error: "Invalid costing method" };
  }
  await prisma.organization.update({
    where: { id: orgId },
    data: { costingMethod: method },
  });
  revalidatePath("/dashboard/settings/costing-method");
  revalidatePath("/dashboard/finans-lab");
  return { success: true };
}

export async function getCostingMethod(): Promise<CostingMethod> {
  const orgId = await getOrganizationId();
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { costingMethod: true },
  });
  return (org?.costingMethod as CostingMethod) || "WAC";
}

export async function getKpiExcludedEmployees(): Promise<string[]> {
  const orgId = await getOrganizationId();
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { kpiExcludedEmployees: true },
  });
  try {
    return JSON.parse(org?.kpiExcludedEmployees || "[]");
  } catch {
    return [];
  }
}

export async function updateKpiExcludedEmployees(names: string[]) {
  const orgId = await getOrganizationId();
  await prisma.organization.update({
    where: { id: orgId },
    data: { kpiExcludedEmployees: JSON.stringify(names) },
  });
  revalidatePath("/dashboard/settings/costing-method");
  revalidatePath("/dashboard/finans-lab");
  return { success: true };
}

export async function getKpiSpecialAccounts(): Promise<string[]> {
  const orgId = await getOrganizationId();
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { kpiSpecialAccounts: true },
  });
  try {
    return JSON.parse(
      org?.kpiSpecialAccounts ||
        '["PDR Server 1 Banquet","Default Online Ordering","Unknown"]'
    );
  } catch {
    return ["PDR Server 1 Banquet", "Default Online Ordering", "Unknown"];
  }
}

export async function updateKpiSpecialAccounts(names: string[]) {
  const orgId = await getOrganizationId();
  await prisma.organization.update({
    where: { id: orgId },
    data: { kpiSpecialAccounts: JSON.stringify(names) },
  });
  revalidatePath("/dashboard/settings/costing-method");
  revalidatePath("/dashboard/finans-lab");
  return { success: true };
}

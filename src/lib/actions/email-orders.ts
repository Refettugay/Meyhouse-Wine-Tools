"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { canApproveOrders } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

interface EmailCartItem {
  productName: string;
  vendor: string;
  locationName: string;
  orderQty: number;
  orderUnit: string;
  bottleSizeMl: number | null;
  casePackSize: number | null;
}

type EmailOrg = {
  name: string;
  orderEmailFrom: string | null;
  orderEmailFromName: string | null;
} | null;

// Core email builder — one email PER REP, each rep sees ONLY their assigned
// stores. Pure given the cart items + org + vendors (no auth/gating here so it
// can be reused by both the cart preview and the approved-order path).
async function buildVendorEmails(
  cartItems: EmailCartItem[],
  org: EmailOrg,
  vendors: Awaited<ReturnType<typeof loadVendorsWithReps>>,
) {
  // Group cart items by vendor
  const byVendor = new Map<string, EmailCartItem[]>();
  for (const item of cartItems) {
    if (!byVendor.has(item.vendor)) byVendor.set(item.vendor, []);
    byVendor.get(item.vendor)!.push(item);
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const senderName = org?.orderEmailFromName || org?.name || "Restaurant";

  const emails: {
    vendor: string;
    recipientEmail: string;
    recipientName: string;
    recipientPhone: string | null;
    subject: string;
    body: string;
    itemCount: number;
  }[] = [];

  for (const [vendorName, vendorItems] of byVendor) {
    const vendor = vendors.find((v) => v.name === vendorName);

    // Group items by store
    const byStore = new Map<string, EmailCartItem[]>();
    for (const item of vendorItems) {
      if (!byStore.has(item.locationName)) byStore.set(item.locationName, []);
      byStore.get(item.locationName)!.push(item);
    }

    // If vendor has reps, match each rep to their assigned stores
    if (vendor?.reps && vendor.reps.length > 0) {
      const storesCovered = new Set<string>();

      for (const rep of vendor.reps) {
        // Get location names this rep is assigned to
        const repLocationNames: string[] = [];
        for (const rl of rep.locations) {
          repLocationNames.push(rl.location.name);
          repLocationNames.push(rl.location.name.replace("Meyhouse ", ""));
        }

        // Find which stores in the cart match this rep's assignments
        const repStoreItems = new Map<string, EmailCartItem[]>();
        for (const [storeName, storeItems] of byStore) {
          const matches = repLocationNames.some(
            (rln) => storeName.includes(rln) || rln.includes(storeName)
          );
          if (matches) {
            repStoreItems.set(storeName, storeItems);
            storesCovered.add(storeName);
          }
        }

        if (repStoreItems.size === 0) continue;

        // Build email for this rep with ONLY their stores
        const repItemCount = [...repStoreItems.values()].reduce(
          (sum, items) => sum + items.length, 0
        );

        const repStoreNames = [...repStoreItems.keys()].join(", ");
        const subject = `Order from ${org?.name || "Restaurant"} — ${repStoreNames} — ${today}`;
        let body = `Hi ${rep.name},\n\n`;
        body += `Please find our order below.\n`;
        body += `Date: ${today}\n`;
        body += `Store(s): ${repStoreNames}\n\n`;
        body += `────────────────────────────────\n`;

        for (const [storeName, storeItems] of repStoreItems) {
          if (repStoreItems.size > 1) {
            body += `\n📍 ${storeName}\n`;
            body += `────────────────────────────────\n`;
          }
          for (const item of storeItems) {
            const sizeInfo = item.bottleSizeMl ? ` (${item.bottleSizeMl}ml)` : "";
            const packInfo =
              item.orderUnit === "case" && item.casePackSize
                ? ` [${item.casePackSize}-pack]`
                : "";
            body += `  ${item.productName}${sizeInfo}${packInfo}\n`;
            body += `    Qty: ${item.orderQty} ${item.orderUnit}${item.orderQty > 1 ? "s" : ""}\n`;
          }
        }

        body += `\n────────────────────────────────\n`;
        body += `Total: ${repItemCount} item${repItemCount > 1 ? "s" : ""}\n\n`;
        body += `Thank you,\n${senderName}\n`;
        if (org?.orderEmailFrom) body += `${org.orderEmailFrom}\n`;

        emails.push({
          vendor: vendorName,
          recipientEmail: rep.email || "",
          recipientName: rep.name,
          recipientPhone: rep.phone || null,
          subject,
          body,
          itemCount: repItemCount,
        });
      }

      // Handle stores not covered by any rep — send to first rep as fallback
      for (const [storeName, storeItems] of byStore) {
        if (!storesCovered.has(storeName)) {
          const fallbackRep = vendor.reps[0];
          const subject = `Order from ${org?.name || "Restaurant"} — ${storeName} — ${today}`;
          let body = `Hi ${fallbackRep.name},\n\n`;
          body += `Please find our order below.\n`;
          body += `Date: ${today}\n`;
          body += `Store: ${storeName}\n\n`;
          body += `────────────────────────────────\n`;
          body += `\n📍 ${storeName}\n`;
          body += `────────────────────────────────\n`;

          for (const item of storeItems) {
            const sizeInfo = item.bottleSizeMl ? ` (${item.bottleSizeMl}ml)` : "";
            const packInfo =
              item.orderUnit === "case" && item.casePackSize
                ? ` [${item.casePackSize}-pack]`
                : "";
            body += `  ${item.productName}${sizeInfo}${packInfo}\n`;
            body += `    Qty: ${item.orderQty} ${item.orderUnit}${item.orderQty > 1 ? "s" : ""}\n`;
          }

          body += `\n────────────────────────────────\n`;
          body += `Total: ${storeItems.length} item${storeItems.length > 1 ? "s" : ""}\n\n`;
          body += `Thank you,\n${senderName}\n`;
          if (org?.orderEmailFrom) body += `${org.orderEmailFrom}\n`;

          emails.push({
            vendor: vendorName,
            recipientEmail: fallbackRep.email || "",
            recipientName: fallbackRep.name,
            recipientPhone: fallbackRep.phone || null,
            subject,
            body,
            itemCount: storeItems.length,
          });
        }
      }
    } else {
      // No reps — create one email with all items, no recipient
      const allStoreNames = [...byStore.keys()].join(", ");
      const subject = `Order from ${org?.name || "Restaurant"} — ${allStoreNames} — ${today}`;
      let body = `Hi ${vendorName},\n\n`;
      body += `Please find our order below.\n`;
      body += `Date: ${today}\n`;
      body += `Store(s): ${allStoreNames}\n\n`;
      body += `────────────────────────────────\n`;

      for (const [storeName, storeItems] of byStore) {
        if (byStore.size > 1) {
          body += `\n📍 ${storeName}\n`;
          body += `────────────────────────────────\n`;
        }
        for (const item of storeItems) {
          const sizeInfo = item.bottleSizeMl ? ` (${item.bottleSizeMl}ml)` : "";
          const packInfo =
            item.orderUnit === "case" && item.casePackSize
              ? ` [${item.casePackSize}-pack]`
              : "";
          body += `  ${item.productName}${sizeInfo}${packInfo}\n`;
          body += `    Qty: ${item.orderQty} ${item.orderUnit}${item.orderQty > 1 ? "s" : ""}\n`;
        }
      }

      body += `\n────────────────────────────────\n`;
      body += `Total: ${vendorItems.length} item${vendorItems.length > 1 ? "s" : ""}\n\n`;
      body += `Thank you,\n${senderName}\n`;
      if (org?.orderEmailFrom) body += `${org.orderEmailFrom}\n`;

      emails.push({
        vendor: vendorName,
        recipientEmail: "",
        recipientName: vendorName,
        recipientPhone: null,
        subject,
        body,
        itemCount: vendorItems.length,
      });
    }
  }

  return { emails, senderEmail: org?.orderEmailFrom || null };
}

function loadVendorsWithReps(orgId: string) {
  return prisma.vendor.findMany({
    where: { organizationId: orgId },
    include: {
      reps: {
        include: {
          locations: { include: { location: true } },
        },
      },
    },
  });
}

function loadEmailOrg(orgId: string): Promise<EmailOrg> {
  return prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true, orderEmailFrom: true, orderEmailFromName: true },
  });
}

// Cart-based preview (Order tab). Emailing vendors is restricted to owners/
// admins — and only APPROVED orders should reach vendors (requirement 3), so
// this path is gated and the approved-order path below is the primary one.
export async function generateOrderEmails(cartItems: EmailCartItem[]) {
  const session = await requireAuth();
  if (!canApproveOrders(session)) {
    return { emails: [], senderEmail: null, error: "Only owners and admins can email vendors." };
  }
  const orgId = session.organizationId;
  const [org, vendors] = await Promise.all([loadEmailOrg(orgId), loadVendorsWithReps(orgId)]);
  return buildVendorEmails(cartItems, org, vendors);
}

// Approved-order email path (requirement 3 + 4). Builds vendor emails from all
// APPROVED orders. Transferred lines have already been reassigned to the
// receiving store's order, so grouping by the order's location naturally puts
// them under the receiving store; we then COMBINE duplicate product lines so
// the vendor sees a single combined quantity and never the transfer itself.
// REJECTED lines are excluded.
export async function generateApprovedOrderEmails() {
  const session = await requireAuth();
  if (!canApproveOrders(session)) {
    return { emails: [], senderEmail: null, orderListIds: [], error: "Only owners and admins can email vendors." };
  }
  const orgId = session.organizationId;

  const [org, vendors, orders] = await Promise.all([
    loadEmailOrg(orgId),
    loadVendorsWithReps(orgId),
    prisma.orderList.findMany({
      where: { organizationId: orgId, status: "APPROVED" },
      include: {
        location: true,
        items: {
          where: { status: { not: "REJECTED" } },
          include: { ingredient: { include: { vendorRef: true } } },
        },
      },
    }),
  ]);

  // Merge by vendor + receiving store + product + unit so transferred and
  // native lines for the same product collapse into one combined quantity.
  const merged = new Map<string, EmailCartItem>();
  for (const order of orders) {
    const locationName = order.location.name;
    for (const item of order.items) {
      const vendor =
        item.vendor || item.ingredient.vendorRef?.name || item.ingredient.vendor || "No Vendor";
      const key = `${vendor}__${locationName}__${item.ingredient.name}__${item.unit}`;
      const existing = merged.get(key);
      if (existing) {
        existing.orderQty += item.quantityNeeded;
      } else {
        merged.set(key, {
          productName: item.ingredient.name,
          vendor,
          locationName,
          orderQty: item.quantityNeeded,
          orderUnit: item.unit,
          bottleSizeMl: item.ingredient.bottleSizeMl,
          casePackSize: item.ingredient.casePackSize,
        });
      }
    }
  }

  const built = await buildVendorEmails([...merged.values()], org, vendors);
  return { ...built, orderListIds: orders.map((o) => o.id) };
}

// Move APPROVED orders to ORDERED once their emails have been sent.
export async function markOrdersOrdered(orderListIds: string[]) {
  const session = await requireAuth();
  if (!canApproveOrders(session)) {
    return { error: "Only owners and admins can finalize orders." };
  }
  if (orderListIds.length === 0) return { success: true, count: 0 };
  const result = await prisma.orderList.updateMany({
    where: { id: { in: orderListIds }, organizationId: session.organizationId, status: "APPROVED" },
    data: { status: "ORDERED" },
  });
  revalidatePath("/dashboard/inventory/orders");
  revalidatePath("/dashboard/inventory/orders/review");
  return { success: true, count: result.count };
}

// Send emails via Resend API
export async function sendOrderEmails(
  emails: {
    vendor: string;
    recipientEmail: string;
    recipientName: string;
    subject: string;
    body: string;
  }[]
) {
  const session = await requireAuth();
  if (!canApproveOrders(session)) {
    return { results: [], error: "Only owners and admins can email vendors." };
  }
  const orgId = session.organizationId;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      orderEmailFrom: true,
      emailProvider: true,
      emailApiKey: true,
    },
  });

  const results: { vendor: string; recipientName: string; status: string; error?: string }[] = [];

  for (const email of emails) {
    if (!email.recipientEmail) {
      await prisma.orderEmail.create({
        data: {
          organizationId: orgId,
          vendorName: email.vendor,
          recipientEmail: "NO EMAIL SET",
          recipientName: email.recipientName,
          subject: email.subject,
          body: email.body,
          status: "FAILED",
          errorMessage: "No email address set for this vendor rep.",
        },
      });
      results.push({ vendor: email.vendor, recipientName: email.recipientName, status: "FAILED", error: "No email address" });
      continue;
    }

    try {
      if (org?.emailApiKey && org.emailProvider === "RESEND") {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${org.emailApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: org.orderEmailFrom || "orders@example.com",
            to: [email.recipientEmail],
            subject: email.subject,
            text: email.body,
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(err);
        }
      }

      await prisma.orderEmail.create({
        data: {
          organizationId: orgId,
          vendorName: email.vendor,
          recipientEmail: email.recipientEmail,
          recipientName: email.recipientName,
          subject: email.subject,
          body: email.body,
          status: org?.emailApiKey ? "SENT" : "DRAFT",
          sentAt: org?.emailApiKey ? new Date() : null,
          errorMessage: !org?.emailApiKey ? "Email not configured." : null,
        },
      });

      results.push({
        vendor: email.vendor,
        recipientName: email.recipientName,
        status: org?.emailApiKey ? "SENT" : "DRAFT",
      });
    } catch (err: any) {
      await prisma.orderEmail.create({
        data: {
          organizationId: orgId,
          vendorName: email.vendor,
          recipientEmail: email.recipientEmail,
          recipientName: email.recipientName,
          subject: email.subject,
          body: email.body,
          status: "FAILED",
          errorMessage: err.message || "Unknown error",
        },
      });
      results.push({ vendor: email.vendor, recipientName: email.recipientName, status: "FAILED", error: err.message });
    }
  }

  revalidatePath("/dashboard/products");
  return { results };
}

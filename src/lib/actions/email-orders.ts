"use server";

import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/session";
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

// Generate email previews — one email PER REP, each rep sees ONLY their assigned stores
export async function generateOrderEmails(cartItems: EmailCartItem[]) {
  const orgId = await getOrganizationId();

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      name: true,
      orderEmailFrom: true,
      orderEmailFromName: true,
    },
  });

  const vendors = await prisma.vendor.findMany({
    where: { organizationId: orgId },
    include: {
      reps: {
        include: {
          locations: { include: { location: true } },
        },
      },
    },
  });

  const allLocations = await prisma.location.findMany({
    where: { organizationId: orgId },
  });

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
  const orgId = await getOrganizationId();

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

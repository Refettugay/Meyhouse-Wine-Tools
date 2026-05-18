"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ShoppingCart, Calendar, MapPin, Search } from "lucide-react";
import { formatCents } from "@/lib/calculations/cost";

interface OrderSummary {
  id: string;
  name: string;
  status: string;
  notes: string | null;
  createdAt: string;
  location: { id: string; name: string };
  itemCount: number;
  totalBottles: number;
  totalCostCents: number;
}

interface Location {
  id: string;
  name: string;
}

export function OrderHistoryList({
  orders,
  locations,
}: {
  orders: OrderSummary[];
  locations: Location[];
}) {
  const [locFilter, setLocFilter] = useState("ALL");
  const [weekFilter, setWeekFilter] = useState<"ALL" | "1" | "2" | "4">("ALL");

  const filtered = useMemo(() => {
    const now = Date.now();
    return orders.filter((o) => {
      if (locFilter !== "ALL" && o.location.id !== locFilter) return false;
      if (weekFilter !== "ALL") {
        const weeks = parseInt(weekFilter);
        const cutoff = now - weeks * 7 * 24 * 60 * 60 * 1000;
        if (new Date(o.createdAt).getTime() < cutoff) return false;
      }
      return true;
    });
  }, [orders, locFilter, weekFilter]);

  // Group by week for a timeline view
  const grouped = useMemo(() => {
    const map = new Map<string, OrderSummary[]>();
    for (const order of filtered) {
      const d = new Date(order.createdAt);
      // Start of week (Sunday)
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const key = weekStart.toISOString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(order);
    }
    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([weekStartISO, orders]) => {
        const start = new Date(weekStartISO);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        const label =
          start.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }) +
          " — " +
          end.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
        return { weekStart: start, label, orders };
      });
  }, [filtered]);

  // Overall stats
  const totalCost = filtered.reduce((s, o) => s + o.totalCostCents, 0);
  const totalBottles = filtered.reduce((s, o) => s + o.totalBottles, 0);

  return (
    <div>
      {/* Filters + stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-white border border-[var(--line)] rounded-xl p-3">
          <p className="text-xs text-[var(--ink-muted)]">Orders</p>
          <p className="text-xl font-bold">{filtered.length}</p>
        </div>
        <div className="bg-white border border-[var(--line)] rounded-xl p-3">
          <p className="text-xs text-[var(--ink-muted)]">Total Bottles</p>
          <p className="text-xl font-bold">{totalBottles}</p>
        </div>
        <div className="bg-white border border-[var(--line)] rounded-xl p-3 col-span-2">
          <p className="text-xs text-[var(--ink-muted)]">Total Cost (est.)</p>
          <p className="text-xl font-bold text-[var(--brand-olive)]">
            {totalCost > 0 ? formatCents(totalCost) : "—"}
          </p>
        </div>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={locFilter}
          onChange={(e) => setLocFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
        >
          <option value="ALL">All Locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={weekFilter}
          onChange={(e) =>
            setWeekFilter(e.target.value as "ALL" | "1" | "2" | "4")
          }
          className="px-3 py-2 bg-white border border-[var(--line)] rounded-lg text-[var(--brand-brown)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-olive)]"
        >
          <option value="ALL">Last 8 weeks</option>
          <option value="4">Last 4 weeks</option>
          <option value="2">Last 2 weeks</option>
          <option value="1">Last week</option>
        </select>
      </div>

      {/* Week groups */}
      <div className="space-y-4">
        {grouped.map((week) => {
          const weekCost = week.orders.reduce(
            (s, o) => s + o.totalCostCents,
            0
          );
          return (
            <div
              key={week.weekStart.toISOString()}
              className="bg-white border border-[var(--line)] rounded-xl overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[var(--line)] bg-[var(--brand-cream)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[var(--brand-olive)]" />
                  <h3 className="font-semibold text-sm">{week.label}</h3>
                  <span className="text-xs text-[var(--ink-muted)]">
                    ({week.orders.length}{" "}
                    {week.orders.length === 1 ? "order" : "orders"})
                  </span>
                </div>
                {weekCost > 0 && (
                  <span className="text-sm font-medium text-[var(--brand-olive)]">
                    {formatCents(weekCost)}
                  </span>
                )}
              </div>
              <div className="divide-y divide-[var(--line)]">
                {week.orders.map((order) => {
                  const d = new Date(order.createdAt);
                  return (
                    <Link
                      key={order.id}
                      href={`/dashboard/inventory/orders/${order.id}`}
                      className="px-4 py-3 flex items-center justify-between hover:bg-[var(--brand-cream)] transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <ShoppingCart className="w-4 h-4 text-[var(--ink-muted)] flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">
                              {order.location.name}
                            </p>
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${
                                order.status === "SENT"
                                  ? "bg-green-100 text-green-700"
                                  : order.status === "RECEIVED"
                                  ? "bg-blue-100 text-blue-700"
                                  : order.status === "COMPLETED"
                                  ? "bg-[var(--brand-cream)] text-[var(--brand-brown)]"
                                  : "bg-[rgba(74,93,39,0.12)] text-[var(--brand-olive-hover)]"
                              }`}
                            >
                              {order.status}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--ink-muted)]">
                            {d.toLocaleDateString()} at{" "}
                            {d.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {" · "}
                            {order.itemCount} items · {order.totalBottles}{" "}
                            bottles
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {order.totalCostCents > 0 && (
                          <p className="text-sm font-medium text-[var(--brand-olive)]">
                            {formatCents(order.totalCostCents)}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

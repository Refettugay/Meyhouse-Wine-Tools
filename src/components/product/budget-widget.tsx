// Monthly beverage budget (owners/admins) — sits in the Product Hub header.
// Spent = invoices logged against the month; pending = expected but not yet
// invoiced (striped part of the bar).

export type BudgetSummary = {
  monthLabel: string;
  budgetCents: number;
  spentCents: number;
  pendingCents: number;
  byStore: { name: string; cents: number }[];
  invoiceCount: number;
};

function dollars(cents: number) {
  return `$${Math.round(Math.abs(cents) / 100).toLocaleString("en-US")}`;
}

export function BudgetWidget({ budget }: { budget: BudgetSummary }) {
  const { monthLabel, budgetCents, spentCents, pendingCents, byStore, invoiceCount } = budget;
  const left = budgetCents - spentCents;
  const leftAfterPending = left - pendingCents;
  const pct = (cents: number) => (budgetCents > 0 ? (cents / budgetCents) * 100 : 0);
  const spentPct = Math.min(100, Math.max(0, pct(spentCents)));
  const pendingPct = Math.min(100 - spentPct, Math.max(0, pct(pendingCents)));

  return (
    <div
      className="flex-1 min-w-[280px] max-w-[560px] rounded-xl border border-[var(--line)] bg-white/70 px-4 py-2.5"
      title={`${invoiceCount} invoice${invoiceCount === 1 ? "" : "s"} logged this month`}
    >
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-[var(--brand-brown)]">{monthLabel} budget</span>
        <span className="text-[var(--ink-muted)] whitespace-nowrap">
          <span className="font-bold text-[var(--ink)]">{dollars(spentCents)}</span> of {dollars(budgetCents)} ·{" "}
          <span className={`font-bold ${left < 0 ? "text-red-700" : "text-[var(--brand-olive)]"}`}>
            {dollars(left)} {left < 0 ? "over" : "left"}
          </span>
        </span>
      </div>

      <div className="mt-1.5 flex h-2 rounded-full overflow-hidden bg-[var(--line)]">
        <div className="h-full bg-[var(--brand-olive)]" style={{ width: `${spentPct}%` }} />
        {pendingPct > 0 && (
          <div
            className="h-full"
            style={{
              width: `${pendingPct}%`,
              opacity: 0.45,
              background: "repeating-linear-gradient(45deg, var(--brand-olive) 0 3px, transparent 3px 6px)",
            }}
          />
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[11px] text-[var(--ink-muted)]">
        <span>{byStore.map((s) => `${s.name} ${dollars(s.cents)}`).join(" · ")}</span>
        {pendingCents > 0 && (
          <span>
            Pending ≈ {dollars(pendingCents)} →{" "}
            {leftAfterPending < 0 ? (
              <span className="font-semibold text-red-700">{dollars(leftAfterPending)} over</span>
            ) : (
              `${dollars(leftAfterPending)} left`
            )}
          </span>
        )}
      </div>
    </div>
  );
}

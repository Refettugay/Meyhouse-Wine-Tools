import { LucideIcon, Sparkles } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  pourSizes: string[];
  suggestedTargetPct: number;
}

export function BeverageComingSoon({
  icon: Icon,
  title,
  description,
  pourSizes,
  suggestedTargetPct,
}: Props) {
  return (
    <div className="max-w-3xl">
      <div className="bg-white border border-[var(--line)] rounded-xl p-6 text-center">
        <div className="w-14 h-14 rounded-xl bg-[#FAF7F1] flex items-center justify-center mx-auto mb-4">
          <Icon className="w-7 h-7 text-[var(--brand-olive)]" />
        </div>
        <h2 className="text-xl font-bold text-[var(--brand-brown)] mb-2">{title}</h2>
        <p className="text-sm text-[var(--ink-muted)] max-w-lg mx-auto mb-6">{description}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto text-left">
          <div className="bg-[var(--brand-cream)] border border-[var(--line)] rounded-lg p-4">
            <p className="text-xs font-bold text-[var(--ink-muted)] uppercase tracking-wide mb-2">
              Pour sizes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {pourSizes.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-[var(--line)] text-xs font-medium text-[var(--brand-brown)]"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
          <div className="bg-[#FAF7F1] border border-[var(--brand-olive)] rounded-lg p-4">
            <p className="text-xs font-bold text-[var(--brand-olive-hover)] uppercase tracking-wide mb-2">
              Default target
            </p>
            <p className="text-2xl font-bold text-[var(--brand-olive-hover)]">
              {suggestedTargetPct}%
            </p>
            <p className="text-xs text-[var(--brand-olive-hover)]/80 mt-0.5">cost % goal</p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-[var(--line)] text-left max-w-lg mx-auto">
          <p className="text-xs font-bold text-[var(--ink-muted)] uppercase tracking-wide mb-3 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-[var(--brand-olive)]" />
            Coming next
          </p>
          <ul className="space-y-1.5 text-sm text-[var(--ink-muted)]">
            <li className="flex items-start gap-2">
              <span className="text-[var(--brand-olive)] mt-0.5">•</span>
              <span>Ingredient pricing table (one price per pour size)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--brand-olive)] mt-0.5">•</span>
              <span>Auto-calculate cost per pour from bottle cost</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--brand-olive)] mt-0.5">•</span>
              <span>Per-item target % override</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--brand-olive)] mt-0.5">•</span>
              <span>Suggested price per pour size</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

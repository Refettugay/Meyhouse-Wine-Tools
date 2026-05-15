import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  comingSoonFeatures?: string[];
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  comingSoonFeatures,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-amber-600" />
      </div>
      <h2 className="text-xl font-bold text-stone-900 mb-2">{title}</h2>
      <p className="text-sm text-stone-500 max-w-md mb-6">{description}</p>

      {comingSoonFeatures && comingSoonFeatures.length > 0 && (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-5 max-w-md w-full text-left">
          <h3 className="text-xs font-bold text-stone-600 uppercase tracking-wide mb-3">
            Coming Soon
          </h3>
          <ul className="space-y-2">
            {comingSoonFeatures.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-2 text-sm text-stone-700"
              >
                <span className="text-amber-500 mt-0.5">•</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

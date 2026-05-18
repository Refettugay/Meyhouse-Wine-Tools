"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function BackToRecipes() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      className="flex items-center gap-2 text-[var(--ink-muted)] hover:text-[var(--brand-brown)] text-sm"
    >
      <ArrowLeft className="w-4 h-4" />
      Back to Recipes
    </button>
  );
}

"use client";

// Duplicate check (Master Database, 2026-11-22): while a NEW product's name is
// typed, show products already in the Master Database with a similar name, so
// staff add the existing one to their store instead of creating a second copy.
import { useEffect, useState } from "react";
import Link from "next/link";
import { findSimilarProducts, type SimilarProduct } from "@/lib/actions/master-database";

export function SimilarProductsHint({ name }: { name: string }) {
  // Results are kept with the name they were found for, so a stale answer never shows.
  const [found, setFound] = useState<{ q: string; hits: SimilarProduct[] }>({ q: "", hits: [] });
  const q = name.trim();
  useEffect(() => {
    if (q.length < 3) return;
    let live = true;
    const t = setTimeout(() => {
      findSimilarProducts(q).then((r) => { if (live) setFound({ q, hits: r }); }).catch(() => {});
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  const hits = q.length >= 3 && found.q === q ? found.hits : [];
  if (hits.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <p className="font-medium">Already in the Master Database — is it one of these?</p>
      <ul className="mt-1 space-y-0.5">
        {hits.map((h) => (
          <li key={h.id}>
            <span className="font-medium">{h.name}</span>
            {h.category && <span className="opacity-70"> · {h.category}</span>}
            <span className="opacity-70"> · {h.archived ? "archived" : h.stores.length ? `in use at ${h.stores.join(", ")}` : "not in use"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1">
        If so, don&apos;t create a new one —{" "}
        <Link href="/dashboard/products?mode=master" className="underline font-medium">open Master Database</Link> and add it to your store.
      </p>
    </div>
  );
}

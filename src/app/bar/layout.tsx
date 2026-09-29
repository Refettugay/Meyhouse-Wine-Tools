import type { Metadata, Viewport } from "next";
import { Fraunces, Figtree } from "next/font/google";
import "./bar.css";

// The staff Recipe Book is its own island (like Tip Entry and the count page):
// no Sophra chrome, no links out, not indexable, and the link token never
// leaks through a Referer header.
const serif = Fraunces({ subsets: ["latin", "latin-ext"], variable: "--font-rb-serif", display: "swap", axes: ["opsz"] });
const sans = Figtree({ subsets: ["latin", "latin-ext"], variable: "--font-rb-sans", display: "swap" });

export const metadata: Metadata = {
  title: { absolute: "Meyhouse Bar Recipes" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EEF0EA" },
    { media: "(prefers-color-scheme: dark)", color: "#141A17" },
  ],
};

export default function BarLayout({ children }: { children: React.ReactNode }) {
  return <div className={`rb ${serif.variable} ${sans.variable}`}>{children}</div>;
}

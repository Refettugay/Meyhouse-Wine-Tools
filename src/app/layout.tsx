import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: {
    default: "Sophra Beverage",
    template: "%s · Sophra Beverage",
  },
  description: "Recipe, ingredient, and pricing management — by Sophra.",
  applicationName: "Sophra Beverage",
  icons: {
    icon: [
      { url: "/favicon/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [
      {
        url: "/favicon/apple-touch-icon-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#F5EFE3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Phase 2 Stage B chrome: dashboard/layout.tsx flexes (rail + content
          column with sticky top bar + scrolling main). `h-full overflow-hidden
          flex flex-col` here matches Schedule and gives the inner `flex-1
          min-h-0` chain a height constraint to flex against. Auth pages stay
          fine because they render their own full-height containers. */}
      <body className="h-full overflow-hidden flex flex-col">{children}</body>
    </html>
  );
}

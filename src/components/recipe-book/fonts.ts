// Fonts for the Recipe Book (staff page + admin copy), as in the approved mock.
import { Fraunces, Figtree } from "next/font/google";

export const rbSerif = Fraunces({ subsets: ["latin", "latin-ext"], variable: "--font-rb-serif", display: "swap", axes: ["opsz"] });
export const rbSans = Figtree({ subsets: ["latin", "latin-ext"], variable: "--font-rb-sans", display: "swap" });

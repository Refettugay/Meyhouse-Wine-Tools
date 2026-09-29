"use client";

// The Recipe Book runs only in the browser: it reads the remembered language
// and store from localStorage when it starts, and there is nothing to
// pre-render before the PIN anyway.
import dynamic from "next/dynamic";

export const RecipeBookEntry = dynamic(() => import("./recipe-book-app").then((m) => m.RecipeBookApp), { ssr: false });

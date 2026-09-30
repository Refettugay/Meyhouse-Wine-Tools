"use client";
// Client-only (reads the remembered language from localStorage when it starts).
import dynamic from "next/dynamic";

export const AdminBookEntry = dynamic(() => import("./admin-book").then((m) => m.AdminBook), { ssr: false });

#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, "../src");

// Dark -> Light beige color replacements
// Order matters! More specific patterns first.
const replacements = [
  // Backgrounds - darker to lightest
  [/bg-zinc-950/g, "bg-stone-50"],
  [/bg-zinc-900\/50/g, "bg-stone-100/50"],
  [/bg-zinc-900/g, "bg-white"],
  [/bg-zinc-800\/50/g, "bg-stone-100/50"],
  [/bg-zinc-800\/30/g, "bg-stone-100/50"],
  [/bg-zinc-800/g, "bg-stone-100"],
  [/bg-zinc-700/g, "bg-stone-200"],

  // Hover backgrounds
  [/hover:bg-zinc-800/g, "hover:bg-stone-100"],
  [/hover:bg-zinc-700/g, "hover:bg-stone-200"],

  // Borders
  [/border-zinc-800/g, "border-stone-200"],
  [/border-zinc-700/g, "border-stone-300"],

  // Divide
  [/divide-zinc-800/g, "divide-stone-200"],
  [/divide-zinc-700/g, "divide-stone-300"],

  // Text - main to faint
  [/text-white/g, "text-stone-900"],
  [/text-zinc-300/g, "text-stone-700"],
  [/text-zinc-400/g, "text-stone-500"],
  [/text-zinc-500/g, "text-stone-400"],
  [/text-zinc-600/g, "text-stone-300"],

  // Hover text
  [/hover:text-white/g, "hover:text-stone-900"],
  [/hover:text-zinc-300/g, "hover:text-stone-700"],

  // Placeholders
  [/placeholder-zinc-500/g, "placeholder-stone-400"],
  [/placeholder-zinc-400/g, "placeholder-stone-500"],

  // Ring (focus)
  [/focus:ring-zinc-\d+/g, "focus:ring-amber-500"],
];

let totalFiles = 0;
let totalReplacements = 0;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "generated") continue;
      walk(full);
    } else if (
      entry.name.endsWith(".tsx") ||
      entry.name.endsWith(".ts") ||
      entry.name.endsWith(".css")
    ) {
      processFile(full);
    }
  }
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, "utf-8");
  const original = content;
  let fileReplacements = 0;

  for (const [pattern, replacement] of replacements) {
    const matches = content.match(pattern);
    if (matches) {
      content = content.replace(pattern, replacement);
      fileReplacements += matches.length;
    }
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, "utf-8");
    totalFiles++;
    totalReplacements += fileReplacements;
    console.log(
      `  ${path.relative(srcDir, filePath)}: ${fileReplacements} replacements`
    );
  }
}

console.log("Updating theme from dark zinc to light beige...\n");
walk(srcDir);
console.log(`\nDone! ${totalReplacements} replacements across ${totalFiles} files`);

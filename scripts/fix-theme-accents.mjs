#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, "../src");

// Fix accent colors for light theme and button text contrast
const replacements = [
  // Button backgrounds with dark text needs white text instead
  [/bg-amber-600 hover:bg-amber-500 text-stone-900/g, "bg-amber-600 hover:bg-amber-500 text-white"],

  // Tab/pill active state (amber bg + dark text) → use white text
  [/bg-amber-600 text-stone-900/g, "bg-amber-600 text-white"],

  // Accent text colors - too light on white background, darken them
  [/text-amber-400/g, "text-amber-600"],
  [/text-red-400/g, "text-red-600"],
  [/text-green-400/g, "text-green-600"],
  [/text-blue-400/g, "text-blue-600"],
  [/text-cyan-400/g, "text-cyan-600"],

  // Fix amber-500 hover color (too light on light bg)
  [/hover:text-amber-400/g, "hover:text-amber-700"],

  // Fix red button backgrounds
  [/bg-red-500\/10 border border-red-500\/20 text-red-600/g, "bg-red-50 border border-red-200 text-red-700"],
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
    } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
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
    console.log(`  ${path.relative(srcDir, filePath)}: ${fileReplacements} fixes`);
  }
}

console.log("Fixing accent colors and button text contrast...\n");
walk(srcDir);
console.log(`\nDone! ${totalReplacements} fixes across ${totalFiles} files`);

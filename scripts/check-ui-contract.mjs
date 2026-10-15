import { readFile } from "node:fs/promises";

const files = [
  "src/pages/dashboard.astro",
  "src/components/dashboard/DashboardView.astro",
  "src/components/dashboard/ImportOutcomeFeedback.tsx",
  "src/components/pdf-processing/ImportOutcomeBanner.tsx",
  "src/components/pdf-processing/RecipeDecisionCard.tsx",
  "src/components/pdf-processing/RecipeImportPanel.tsx",
  "src/pages/dashboard/import.astro",
];

const palette =
  /\b(?:bg|text|border|ring|outline|decoration|fill|stroke|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-[a-z\d]+)*/g;
const arbitraryUtility = /\b[a-z][\w-]*-\[[^\]\n]+\]/g;
const arbitraryProperty = /\[(?:--[\w-]+|[a-z][\w-]*):[^\]\n]+\]/gi;
const literalColor = /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\s*\(/gi;
const inlineStyle = /\bstyle\s*=/g;

const checks = [
  ["palette colour utility", palette],
  ["arbitrary Tailwind value", arbitraryUtility],
  ["arbitrary Tailwind property", arbitraryProperty],
  ["literal CSS colour", literalColor],
  ["inline style", inlineStyle],
];

const violations = [];

for (const file of files) {
  const contents = await readFile(file, "utf8");
  const lines = contents.split(/\r?\n/);

  for (const [label, pattern] of checks) {
    for (const [index, line] of lines.entries()) {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        violations.push(`${file}:${index + 1}:${match.index + 1} ${label}: ${match[0]}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("UI contract violations:\n" + violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`UI contract passed for ${files.length} scoped files.`);
}

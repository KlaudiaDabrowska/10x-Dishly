// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  _comment:
    "This config was generated using 'stryker init'. Please take a look at: https://stryker-mutator.io/docs/stryker-js/configuration/ for more information.",
  packageManager: "npm",
  reporters: ["html", "clear-text", "progress"],
  testRunner: "command",
  commandRunner: { command: "npm run test:pdf" },
  coverageAnalysis: "off",
  ignorePatterns: ["/.astro", "/.cache", "/.wrangler", "/dist", "/tools/ui-preview/dist"],
};
export default config;

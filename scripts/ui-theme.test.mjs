import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const css = await readFile(new URL("../src/styles/global.css", import.meta.url), "utf8");

function tokenBlock(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `Missing ${selector} token block`);

  return Object.fromEntries(
    [...match[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );
}

function rgb(hex) {
  const value = hex.replace("#", "");
  assert.match(value, /^[0-9a-f]{6}$/i, `Expected a six-digit hex colour, received ${hex}`);
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function luminance(hex) {
  const [red, green, blue] = rgb(hex).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first, second) {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

const textPairs = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["muted-foreground", "muted"],
  ["primary-foreground", "primary"],
  ["primary-foreground", "primary-hover"],
  ["secondary-foreground", "secondary"],
  ["secondary-foreground", "secondary-hover"],
  ["accent-foreground", "accent"],
  ["accent-foreground", "accent-hover"],
  ["destructive-foreground", "destructive"],
  ["destructive-foreground", "destructive-hover"],
];

for (const [theme, selector] of [
  ["light", ":root"],
  ["dark", ".dark"],
]) {
  test(`${theme} theme text pairs meet WCAG AA contrast`, () => {
    const tokens = tokenBlock(selector);

    for (const [foreground, background] of textPairs) {
      const ratio = contrast(tokens[foreground], tokens[background]);
      assert.ok(ratio >= 4.5, `${theme} ${foreground}/${background} contrast is ${ratio.toFixed(2)}:1`);
    }
  });

  test(`${theme} focus ring is visible against adjacent surfaces`, () => {
    const tokens = tokenBlock(selector);

    for (const surface of ["background", "card"]) {
      const ratio = contrast(tokens.ring, tokens[surface]);
      assert.ok(ratio >= 3, `${theme} ring/${surface} contrast is ${ratio.toFixed(2)}:1`);
    }
  });
}

test("Tailwind roles reference source tokens without self-cycles", () => {
  const theme = tokenBlock("@theme inline");
  const expectedMappings = {
    "color-destructive-foreground": "var(--destructive-foreground)",
    "color-primary-hover": "var(--primary-hover)",
    "font-sans": "var(--font-sans-source)",
    "shadow-surface": "var(--shadow-surface-value)",
  };

  for (const [name, expected] of Object.entries(expectedMappings)) {
    assert.equal(theme[name], expected);
    assert.notEqual(theme[name], `var(--${name})`);
  }
});

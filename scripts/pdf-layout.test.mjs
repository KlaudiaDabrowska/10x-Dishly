import assert from "node:assert/strict";
import test from "node:test";
import { createVisualLines } from "../src/lib/pdf-processing/layout.ts";
import { createPdfRecipeInput } from "../src/lib/pdf-processing/prompt.ts";

function item(itemIndex, text, x, y, width = 80, height = 10) {
  return {
    anchor: { page: 1, itemIndex },
    text,
    transform: [height, 0, 0, height, x, y],
    width,
    height,
    direction: "ltr",
    hasEOL: false,
  };
}

test("visual lines put late source titles first and retain separate aligned variant columns", () => {
  const page = {
    page: 1,
    width: 600,
    height: 800,
    rotation: 0,
    items: [
      item(0, "250 kcal", 60, 620, 50, 15),
      item(1, "350 kcal", 230, 620.1, 50, 15),
      item(2, "450 kcal", 420, 620, 50, 15),
      item(3, "- 50 g grain", 40, 570, 150),
      item(4, "(half cup)", 40, 555),
      item(5, "- 75 g grain", 215, 570, 150),
      item(6, "(one cup)", 215, 555),
      item(7, "- 100 g grain", 390, 570, 150),
      item(8, "(two cups)", 390, 555),
      item(9, "Mix", 40, 300, 18),
      item(10, "well.", 62, 300, 23),
      item(11, "Preparation", 40, 340),
      item(12, "Recipe title", 110, 750, 300, 30),
      item(13, "Meal", 100, 680),
      item(14, "Dinner", 100, 665),
      item(15, "Alternatives", 40, 200),
      item(16, "Use oats instead.", 40, 170),
      item(17, "Book footer", 150, 25),
    ],
  };
  const before = globalThis.structuredClone(page);
  const lines = createVisualLines(page);
  assert.deepEqual(page, before);
  assert.equal(lines[0].cells[0].text, "Recipe title");
  assert.deepEqual(lines[0].cells[0].anchors, [{ page: 1, itemIndex: 12 }]);
  assert.deepEqual(
    lines.find((line) => line.baseline === 620.1).cells.map((cell) => cell.text),
    ["250 kcal", "350 kcal", "450 kcal"],
  );
  assert.deepEqual(
    lines.find((line) => line.baseline === 570).cells.map((cell) => cell.text),
    ["- 50 g grain", "- 75 g grain", "- 100 g grain"],
  );
  assert.deepEqual(
    lines.find((line) => line.baseline === 555).cells.map((cell) => cell.text),
    ["(half cup)", "(one cup)", "(two cups)"],
  );
  assert.equal(lines.find((line) => line.baseline === 300).cells[0].text, "Mix well.");
  assert.deepEqual(lines.find((line) => line.baseline === 300).cells[0].anchors, [
    { page: 1, itemIndex: 9 },
    { page: 1, itemIndex: 10 },
  ]);
  assert.equal(lines.at(-1).cells[0].text, "Book footer");
  assert.deepEqual(
    lines
      .flatMap((line) => line.cells.flatMap((cell) => cell.anchors.map((anchor) => anchor.itemIndex)))
      .sort((a, b) => a - b),
    page.items.map((entry) => entry.anchor.itemIndex),
  );
});

test("unsupported orientation and whitespace remain unchanged in the real provider input", () => {
  const entries = [
    item(0, " ", 30, 700),
    item(1, "", 30, 700, 0, 0),
    item(2, "Horizontal", 30, 600),
    { ...item(3, "Rotated", 100, 200), transform: [0, 10, -10, 0, 100, 200] },
  ];
  const page = { page: 1, width: 600, height: 800, rotation: 0, items: entries };
  const batch = {
    version: 2,
    index: 0,
    source: { version: 1, sha256: "f".repeat(64), filename: "synthetic.pdf", byteLength: 100, pageCount: 1 },
    corePages: [1],
    adjacentContextPages: [],
    documentContextPages: [1],
    pages: [page],
  };
  const parsed = JSON.parse(createPdfRecipeInput(batch));
  assert.deepEqual(parsed.pages[0].items, entries);
  assert.deepEqual(
    parsed.pages[0].visualLines.flatMap((line) => line.cells.map((cell) => cell.text)),
    ["Horizontal"],
  );
  assert.deepEqual(createVisualLines({ ...page, rotation: 90 }), []);
  assert.deepEqual(createVisualLines(page), createVisualLines(page));
});

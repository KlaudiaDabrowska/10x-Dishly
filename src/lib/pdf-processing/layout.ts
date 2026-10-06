import type { PageText, PageTextItem, SourceItemAnchor } from "./contracts.ts";

export interface VisualLine {
  baseline: number;
  cells: { x: number; text: string; anchors: SourceItemAnchor[] }[];
}

// An auxiliary visual index, never a replacement for the original items. Only
// ordinary horizontal LTR text is grouped; unsupported orientations remain raw.
// PDF coordinates have their origin at the bottom left on unrotated pages.
export function createVisualLines(page: PageText): VisualLine[] {
  if (page.rotation % 360 !== 0) return [];
  const items = page.items
    .filter(
      (item) =>
        item.text.trim().length > 0 &&
        item.direction === "ltr" &&
        item.height > 0 &&
        item.transform[0] > 0 &&
        item.transform[3] > 0 &&
        Math.abs(item.transform[1]) < 0.001 &&
        Math.abs(item.transform[2]) < 0.001,
    )
    .sort(
      (left, right) =>
        right.transform[5] - left.transform[5] ||
        left.transform[4] - right.transform[4] ||
        left.anchor.itemIndex - right.anchor.itemIndex,
    );
  const rows: { baseline: number; height: number; items: PageTextItem[] }[] = [];
  for (const item of items) {
    const prior = rows.at(-1);
    if (prior && Math.abs(prior.baseline - item.transform[5]) <= Math.min(prior.height, item.height) * 0.25) {
      prior.items.push(item);
      prior.height = Math.min(prior.height, item.height);
    } else rows.push({ baseline: item.transform[5], height: item.height, items: [item] });
  }
  return rows.map((row) => {
    const cells: VisualLine["cells"] = [];
    let rightEdge = -Infinity;
    let priorHeight = row.height;
    for (const item of row.items.sort(
      (left, right) => left.transform[4] - right.transform[4] || left.anchor.itemIndex - right.anchor.itemIndex,
    )) {
      const x = item.transform[4];
      const gap = x - rightEdge;
      const prior = cells.at(-1);
      if (prior && gap <= Math.max(priorHeight, item.height)) {
        // Synthetic whitespace only makes positioned fragments readable. Every
        // fragment remains addressable and its original text stays in raw items.
        const separator =
          gap > Math.min(priorHeight, item.height) * 0.15 && !/\s$/.test(prior.text) && !/^\s/.test(item.text)
            ? " "
            : "";
        prior.text += separator + item.text;
        prior.anchors.push({ ...item.anchor });
      } else cells.push({ x: Math.round(x * 100) / 100, text: item.text, anchors: [{ ...item.anchor }] });
      rightEdge = Math.max(rightEdge, x + item.width);
      priorHeight = item.height;
    }
    return { baseline: Math.round(row.baseline * 100) / 100, cells };
  });
}

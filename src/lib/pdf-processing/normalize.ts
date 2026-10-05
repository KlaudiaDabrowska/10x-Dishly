import type { PdfTextBatch } from "./batching.ts";
import type { PageText, PageTextItem, RecipeCandidate } from "./contracts.ts";

// Deterministic, source-derived corrections of recurring model representation errors.
// Inputs are only the validated candidate and the supplied source text/geometry: never
// reference recipes, fixture identities or titles. Every applied change is reported.

const collapse = (value: string) => value.replace(/\s+/gu, " ").trim();

const SECTION_HEADING = /^(składniki|ingredients)(\s+(na|do przygotowania|for)(\s+\S+){0,3})?\s*:?$/iu;

export function isIngredientSectionHeading(label: string): boolean {
  return SECTION_HEADING.test(collapse(label));
}

const HOUSEHOLD_PARENTHETICAL =
  /\s*\(([^()]*(\d|½|¼|¾|⅓|⅔|\bpół\b|sztuk|opakowa|łyż|szklan|garś|garść|plast|szczypt|piersi|ząb)[^()]*)\)\s*$/iu;

// name must be the ingredient wording after the explicit metric amount, verbatim.
export function sourceIngredientName(sourceText: string, quantity: string | null, unit: string | null): string | null {
  if (!quantity || !unit) return null;
  const escape = (value: string) => collapse(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`^${escape(quantity)}\\s*${escape(unit)}\\s+(.+)$`, "u").exec(collapse(sourceText));
  if (!match) return null;
  const remainder = match[1].replace(HOUSEHOLD_PARENTHETICAL, "").trim();
  return remainder || null;
}

const MARKER = /^\s*(\d+[.)]|[•●▪◦*–-])(\s|$)/u;
const isVisibleHorizontal = (item: PageTextItem) =>
  item.text.trim().length > 0 &&
  item.height > 0 &&
  Math.abs(item.transform[1]) < 0.001 &&
  Math.abs(item.transform[2]) < 0.001;

function sameRow(left: PageTextItem, right: PageTextItem) {
  return Math.abs(left.transform[5] - right.transform[5]) <= Math.min(left.height, right.height) * 0.25;
}

function startsNumberedOrBulleted(page: PageText, item: PageTextItem) {
  if (MARKER.test(item.text)) return true;
  return page.items.some(
    (other) =>
      other !== item &&
      isVisibleHorizontal(other) &&
      sameRow(other, item) &&
      other.transform[4] < item.transform[4] &&
      item.transform[4] - (other.transform[4] + other.width) < item.height * 3 &&
      MARKER.test(other.text.trim() + " "),
  );
}

// A wrapped paragraph line directly below the previous entry's last line, in the same column.
function continuesLine(previous: PageTextItem, next: PageTextItem) {
  const gap = previous.transform[5] - next.transform[5];
  const height = Math.min(previous.height, next.height);
  const overlap =
    Math.min(previous.transform[4] + previous.width, next.transform[4] + next.width) -
    Math.max(previous.transform[4], next.transform[4]);
  return gap >= height * 0.5 && gap <= height * 2 && overlap > 0;
}

function shouldMerge(pages: PageText[], previousEntry: string, entry: string) {
  const before = collapse(previousEntry);
  const after = collapse(entry);
  for (const page of pages) {
    const items = page.items.filter(isVisibleHorizontal);
    const ends = items.filter((item) => {
      const text = collapse(item.text);
      return text.length >= Math.min(8, before.length) && before.endsWith(text);
    });
    const starts = items.filter((item) => {
      const text = collapse(item.text);
      return text.length >= Math.min(8, after.length) && after.startsWith(text);
    });
    for (const start of starts) {
      if (startsNumberedOrBulleted(page, start)) continue;
      if (ends.some((end) => end !== start && continuesLine(end, start))) return true;
    }
  }
  return false;
}

export function normalizeCandidate(
  candidate: RecipeCandidate,
  batch: PdfTextBatch,
): { candidate: RecipeCandidate; changes: string[] } {
  const changes: string[] = [];
  let ingredientGroups = candidate.ingredientGroups;
  if (
    ingredientGroups.length === 1 &&
    ingredientGroups[0].label &&
    isIngredientSectionHeading(ingredientGroups[0].label)
  ) {
    ingredientGroups = [{ ...ingredientGroups[0], label: null }];
    changes.push("normalized-section-heading-label");
  }
  ingredientGroups = ingredientGroups.map((group, groupIndex) => ({
    ...group,
    ingredients: group.ingredients.map((ingredient, ingredientIndex) => {
      const sourceName = sourceIngredientName(ingredient.sourceText, ingredient.quantity, ingredient.unit);
      const name = collapse(ingredient.name);
      if (!sourceName || sourceName === name || !sourceName.startsWith(name)) return ingredient;
      changes.push(`normalized-ingredient-name:${groupIndex}.${ingredientIndex}`);
      return { ...ingredient, name: sourceName };
    }),
  }));
  const pages = batch.pages.filter((page) => candidate.pages.includes(page.page));
  const instructions: string[] = [];
  for (const entry of candidate.instructions) {
    const previous = instructions.at(-1);
    if (previous !== undefined && shouldMerge(pages, previous, entry)) {
      instructions[instructions.length - 1] = collapse(previous) + " " + collapse(entry);
      changes.push(`merged-wrapped-instruction:${instructions.length - 1}`);
    } else instructions.push(entry);
  }
  return { candidate: { ...candidate, ingredientGroups, instructions }, changes };
}

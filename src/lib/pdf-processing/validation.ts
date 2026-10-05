import type { PdfTextBatch } from "./batching.ts";
import {
  PDF_RECIPE_CONTRACT_VERSION,
  PDF_OMISSION_RULES,
  hasValidGroupLabels,
  isRecipeCategory,
  sourceItemKey,
} from "./contracts.ts";
import type {
  Ingredient,
  IngredientGroup,
  OmissionCode,
  OmissionReason,
  RecipeCandidate,
  SourceItemAnchor,
} from "./contracts.ts";
import { categoryFromSource } from "./categories.ts";
import { normalizeCandidate } from "./normalize.ts";
import { PDF_RECIPE_SCHEMA_NAME } from "./prompt.ts";
import { PDF_LIMITS } from "./limits.ts";

const CANDIDATE_KEYS = [
  "version",
  "sourceStart",
  "pages",
  "title",
  "category",
  "sourceCategory",
  "ingredientGroups",
  "instructions",
  "servings",
  "footnotes",
  "missingFieldReasons",
] as const;

export type CandidateValidation =
  | { status: "complete" | "incomplete"; candidate: RecipeCandidate; warnings: string[] }
  | { status: "invalid"; errors: string[]; issues: { code: string; fieldPath: string; condition: string }[] };

function invalid(code: string, fieldPath: string, condition: string): CandidateValidation {
  return { status: "invalid", errors: [code], issues: [{ code, fieldPath, condition }] };
}

export function explainOmission(reason: OmissionReason): string {
  return PDF_OMISSION_RULES[reason.code].explanation;
}

function parseReasons(value: unknown): OmissionReason[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const reasons: OmissionReason[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !exactKeys(entry, ["code", "fieldPath"]) || typeof entry.code !== "string") return null;
    if (!Object.hasOwn(PDF_OMISSION_RULES, entry.code)) return null;
    const code = entry.code as OmissionCode;
    if (entry.fieldPath !== PDF_OMISSION_RULES[code].fieldPath) return null;
    if (reasons.some((reason) => reason.code === code)) return null;
    reasons.push({ code, fieldPath: entry.fieldPath as string });
  }
  return reasons;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, index) => key === actual[index]);
}

function boundedString(value: unknown, maximum: number, nullable = false): value is string | null {
  return (nullable && value === null) || (typeof value === "string" && value.length <= maximum);
}

function parseAnchor(value: unknown): SourceItemAnchor | null {
  if (!isRecord(value) || !exactKeys(value, ["page", "itemIndex"])) return null;
  if (!Number.isSafeInteger(value.page) || Number(value.page) < 1 || Number(value.page) > PDF_LIMITS.maxPages)
    return null;
  if (!Number.isSafeInteger(value.itemIndex) || Number(value.itemIndex) < 0) return null;
  return { page: Number(value.page), itemIndex: Number(value.itemIndex) };
}

function parseIngredient(value: unknown): Ingredient | null {
  if (!isRecord(value) || !exactKeys(value, ["name", "quantity", "unit", "sourceText"])) return null;
  const { name, quantity, unit, sourceText } = value;
  if (typeof name !== "string" || name.length > 500 || !boundedString(quantity, 2_000, true)) return null;
  if (!boundedString(unit, 2_000, true) || typeof sourceText !== "string" || sourceText.length > 2_000) return null;
  return { name, quantity, unit, sourceText };
}

function parseGroups(value: unknown): IngredientGroup[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const groups: IngredientGroup[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || !exactKeys(raw, ["label", "ingredients"])) return null;
    if (!boundedString(raw.label, 2_000, true) || !Array.isArray(raw.ingredients) || raw.ingredients.length > 200)
      return null;
    const ingredients = raw.ingredients.map(parseIngredient);
    if (ingredients.some((item) => item === null)) return null;
    groups.push({ label: raw.label, ingredients: ingredients as Ingredient[] });
  }
  return groups;
}

function parseStringArray(value: unknown, maximumItems: number, maximumLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  if (value.some((item) => !boundedString(item, maximumLength))) return null;
  return value as string[];
}

export function validateRecipeCandidate(raw: unknown, batch: PdfTextBatch): CandidateValidation {
  if (!isRecord(raw) || !exactKeys(raw, CANDIDATE_KEYS)) return invalid("invalid-schema", "$", "exact-candidate-keys");
  const sourceStart = parseAnchor(raw.sourceStart);
  const groups = parseGroups(raw.ingredientGroups);
  const instructions = parseStringArray(raw.instructions, 100, 8_000);
  const footnotes = parseStringArray(raw.footnotes, 100, 4_000);
  const missingReasons = parseReasons(raw.missingFieldReasons);
  if (raw.version !== PDF_RECIPE_CONTRACT_VERSION)
    return invalid("invalid-schema", "version", "recipe-contract-v2-required");
  if (!sourceStart) return invalid("invalid-schema", "sourceStart", "valid-source-anchor-required");
  if (!Array.isArray(raw.pages) || raw.pages.length > PDF_LIMITS.maxPages)
    return invalid("invalid-schema", "pages", "bounded-page-array-required");
  if (!boundedString(raw.title, 2_000, true))
    return invalid("invalid-schema", "title", "nullable-bounded-string-required");
  if (!(raw.category === null || isRecipeCategory(raw.category)))
    return invalid("invalid-schema", "category", "allowed-category-required");
  if (!boundedString(raw.sourceCategory, 2_000, true))
    return invalid("invalid-schema", "sourceCategory", "nullable-bounded-string-required");
  if (!groups) return invalid("invalid-schema", "ingredientGroups", "bounded-ingredient-groups-required");
  if (!instructions) return invalid("invalid-schema", "instructions", "bounded-string-array-required");
  if (!boundedString(raw.servings, 2_000, true))
    return invalid("invalid-schema", "servings", "nullable-bounded-string-required");
  if (!footnotes) return invalid("invalid-schema", "footnotes", "bounded-string-array-required");
  if (!missingReasons)
    return invalid(
      "invalid-omission-reason",
      "missingFieldReasons",
      "known-unique-code-with-matching-field-path-required",
    );

  const pages = raw.pages as unknown[];
  if (pages.length === 0) return invalid("invalid-provenance", "pages", "nonempty-source-pages-required");
  for (const [index, page] of pages.entries()) {
    if (!Number.isSafeInteger(page) || Number(page) < 1)
      return invalid("invalid-provenance", `pages[${index}]`, "positive-page-integer-required");
    if (Number(page) > PDF_LIMITS.maxPages)
      return invalid("invalid-provenance", `pages[${index}]`, "page-limit-exceeded");
    if (index > 0 && Number(page) <= Number(pages[index - 1]))
      return invalid("invalid-provenance", `pages[${index}]`, "strictly-ascending-unique-pages-required");
    if (!batch.pages.some((sourcePage) => sourcePage.page === page))
      return invalid("invalid-provenance", `pages[${index}]`, "page-not-supplied");
  }
  if (!pages.includes(sourceStart.page)) return invalid("invalid-provenance", "pages", "source-start-page-not-listed");
  const anchors = new Set(batch.pages.flatMap((page) => page.items.map((item) => sourceItemKey(item.anchor))));
  if (!anchors.has(sourceItemKey(sourceStart)))
    return invalid("invalid-provenance", "sourceStart", "anchor-not-supplied");
  if (!batch.corePages.includes(sourceStart.page))
    return invalid("invalid-provenance", "sourceStart.page", "context-only-anchor-is-not-owned");
  const warnings: string[] = [];
  if (groups.length > 0 && !hasValidGroupLabels(groups)) {
    // A missing label among several groups loses no content; duplicate or blank single labels stay invalid.
    const seen = new Set<string>();
    const index = groups.findIndex((group) => {
      const label = group.label?.trim() ?? "";
      const bad = groups.length === 1 ? true : label !== "" && seen.has(label);
      seen.add(label);
      return bad;
    });
    if (index >= 0)
      return invalid(
        "invalid-group-labels",
        `ingredientGroups[${index}].label`,
        "distinct-nonempty-variant-label-required",
      );
    warnings.push("unlabelled-variant-group");
  }
  for (const [groupIndex, group] of groups.entries()) {
    for (const [ingredientIndex, ingredient] of group.ingredients.entries()) {
      for (const field of ["name", "sourceText"] as const) {
        if (!ingredient[field].trim())
          return invalid(
            "invalid-empty-value",
            `ingredientGroups[${groupIndex}].ingredients[${ingredientIndex}].${field}`,
            "nonempty-string-required",
          );
      }
    }
  }
  for (const [field, entries] of [
    ["instructions", instructions],
    ["footnotes", footnotes],
  ] as const) {
    const index = entries.findIndex((entry) => !entry.trim());
    if (index >= 0) return invalid("invalid-empty-value", `${field}[${index}]`, "nonempty-string-required");
  }

  const sourceCategory = raw.sourceCategory?.trim() ? raw.sourceCategory : null;
  const mappedCategory = categoryFromSource(sourceCategory);
  let category = raw.category;
  if (sourceCategory !== null) {
    if (mappedCategory === null) {
      warnings.push("unmapped-source-category");
      category = null;
    } else {
      if (category !== null && category !== mappedCategory) warnings.push("category-conflict");
      category = mappedCategory;
    }
  }

  const requiredMissing = new Set<OmissionCode>();
  if (!raw.title?.trim()) requiredMissing.add("missing-title");
  if (groups.length === 0 || groups.some((group) => group.ingredients.length === 0))
    requiredMissing.add("missing-ingredients");
  if (instructions.length === 0) requiredMissing.add("missing-instructions");
  if (category === null) requiredMissing.add("missing-category");
  if (sourceCategory === null) warnings.push("source-category-absent");
  // Code owns verified field presence and source metadata: contradicted model reasons are dropped, not trusted.
  const reasons: OmissionReason[] = [];
  for (const reason of missingReasons) {
    // pages and sourceStart have already passed provenance validation above.
    const contradictory =
      (reason.code === "absent-servings" && raw.servings !== null) ||
      (reason.code === "absent-footnotes" && footnotes.length > 0) ||
      reason.code === "missing-source-metadata" ||
      (["missing-title", "missing-ingredients", "missing-instructions", "missing-category"].includes(reason.code) &&
        !requiredMissing.has(reason.code));
    if (contradictory) {
      warnings.push(`dropped-contradictory-reason:${reason.code}`);
      continue;
    }
    if (PDF_OMISSION_RULES[reason.code].required) requiredMissing.add(reason.code);
    reasons.push(reason);
  }
  for (const code of requiredMissing) {
    if (!reasons.some((reason) => reason.code === code))
      reasons.push({ code, fieldPath: PDF_OMISSION_RULES[code].fieldPath });
  }
  reasons.sort((left, right) => left.code.localeCompare(right.code));

  const normalized = normalizeCandidate(
    {
      version: PDF_RECIPE_CONTRACT_VERSION,
      sourceStart,
      pages: pages.map((page) => Number(page)),
      title: raw.title,
      category,
      sourceCategory,
      ingredientGroups: groups,
      instructions,
      servings: raw.servings,
      footnotes,
      missingFieldReasons: reasons,
    },
    batch,
  );
  warnings.push(...normalized.changes);
  return { status: requiredMissing.size === 0 ? "complete" : "incomplete", candidate: normalized.candidate, warnings };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

function hasCurrentRecipeVersion(value: unknown): boolean {
  return isRecord(value) && value.version === PDF_RECIPE_CONTRACT_VERSION;
}

export async function digestValidatedCandidate(options: {
  candidate: RecipeCandidate;
  ownerId: string;
  importId: string;
  batchIndex: number;
  schemaName?: string;
}): Promise<string> {
  if (
    !options.ownerId.trim() ||
    !options.importId.trim() ||
    !Number.isSafeInteger(options.batchIndex) ||
    options.batchIndex < 0 ||
    !hasCurrentRecipeVersion(options.candidate) ||
    (options.schemaName !== undefined && options.schemaName !== PDF_RECIPE_SCHEMA_NAME)
  )
    throw new Error("invalid-digest-context");
  const payload = canonicalJson({
    contractVersion: PDF_RECIPE_CONTRACT_VERSION,
    schema: options.schemaName ?? PDF_RECIPE_SCHEMA_NAME,
    ownerId: options.ownerId,
    importId: options.importId,
    batchIndex: options.batchIndex,
    candidate: options.candidate,
  });
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

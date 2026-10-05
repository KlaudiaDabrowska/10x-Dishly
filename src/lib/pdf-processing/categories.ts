import type { RecipeCategory } from "./contracts.ts";

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function categoryFromSource(value: string | null): RecipeCategory | null {
  if (!value?.trim()) return null;
  const normalized = fold(value);
  // Modifiers such as "sweet" and "savory" never override the meal heading.
  if (/\b(second breakfast|ii sniadanie|drugie sniadanie)\b/.test(normalized)) return "breakfast";
  if (/\b(breakfast|sniadanie)\b/.test(normalized)) return "breakfast";
  if (/\b(lunch|obiad|obiady)\b/.test(normalized)) return "lunch";
  if (/\b(dinner|kolacja|kolacje)\b/.test(normalized)) return "dinner";
  if (/\b(dessert|deser|desery)\b/.test(normalized)) return "dessert";
  return null;
}

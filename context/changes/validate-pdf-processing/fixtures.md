# F-01 reference fixtures

Prepared locally on 2026-09-30. Golden content was **approved by the user on 2026-09-30**; schema validation alone does not certify recipe accuracy.

## Inventory

| ID     | Original filename                         |    Bytes | PDF pages | Role                                             | Recipe pages   |
| ------ | ----------------------------------------- | -------: | --------: | ------------------------------------------------ | -------------- |
| summer | LETNI-DZIEN-PROBNY.pdf                    | 16593596 |        16 | Full import                                      | 7, 9, 11, 13   |
| pasta  | MINI-E-BOOK-MAKARONOWY-2kbhp6.pdf         | 12689424 |        12 | Full import                                      | 4, 6, 8, 9, 11 |
| low-gi | Niski indeks glikemiczny - niska waga.pdf | 10662733 |       113 | Within the 115-page limit; no golden, not an acceptance fixture | None required  |
| lunchboxy | lunchboxy-1-12.pdf (pages 1–12 of "8. Klaudia MIx Fit - Lunchboxy.pdf") | 7038572 | 12 | Acceptance (replaces pasta); golden approved 2026-10-05 | 4, 6, 8, 10, 12 |

The [manifest](../../../evaluation/validate-pdf-processing/manifest.json) pins exact file and reference SHA-256 hashes. A filename match alone is insufficient.
The 113-page ebook stays outside the 100-page product limit. No additional 50-recipe file is required.

## Local artifacts and review

- [Visual comparison](../../../evaluation/validate-pdf-processing/local/review/index.html): all nine expected recipes beside the original pages; open this HTML file locally in a browser.
- [Markdown comparison](../../../evaluation/validate-pdf-processing/local/review/review.md): the same ingredient lists, instructions, notes and page images.
- Expected content: `evaluation/validate-pdf-processing/local/references/summer.json` and `pasta.json`.
- Original input copies: `evaluation/validate-pdf-processing/local/pdfs/`.
- Source extraction and page renderings: `local/text/` and `local/review/`.

The whole `local/` subtree is ignored by Git. Full recipe text, original ebooks and page images must not be staged. Only metadata/schema, synthetic tests and this review procedure are shared.
Initial files were copied from the user's existing `/home/klaudia/Pobrane/` directory. Source files there were not modified.

## Method and expected structure

The references were prepared with local Poppler text extraction, using positioned lines to separate columns, and visually compared with all nine rendered recipe pages. No Gemini/API inference was used.
The user completed the independent review and explicitly approved both references.

- Summer: four dishes, each with exactly three labelled ingredient groups in the golden and one shared preparation paragraph. Since the 2026-10-05 acceptance amendment, extraction needs at least one complete variant per dish (any single golden variant, or each returned group matching a distinct one); the golden itself is unchanged. Labels retain the source kcal strings as identifiers; no calorie calculation is performed.
- Summer source categories are breakfast, second breakfast, lunch and dinner. The second-breakfast dessert maps to breakfast, not dessert.
- Pasta: five recipes, one unlabelled ingredient group each, all with the explicit two-serving statement. The source's cover/contents identify them as lunches; a page-3 text anchor records this category provenance.
- Preserve all serving/footnote and substitution text. Alternatives stay notes, not extra required ingredients or new recipe cards.
- The summer shopping list, editorial pages, pasta contents and photo-only pages are not recipes.
- Source anchors use 1-based PDF page numbers plus literal text and occurrence, matched after whitespace normalization against local PDF text. They are independent reference locators, not invented PDF.js item IDs. Phase 2 supplies runtime item IDs; the reader must map them to these source locations.

## Field comparison rules

The source text is authoritative. Whitespace and line wrapping may be normalized; quantities, units, variant labels, ingredient relationships, temperatures, durations and footnotes may not be silently corrected, converted or omitted.

`sourceText` retains the complete ingredient wording, including household measures, parentheses, alternatives, asterisks and sauce context. `quantity`/`unit` preserve the explicitly written scalar grams/ml where available, as strings (including fractions); they are not calculated from household measures. When the line does not provide one unambiguous scalar pair, these fields are null and its quantity wording remains in `sourceText`. Null scalar fields alone do not make an ingredient missing. In particular, no conversion of a pinch, handful, half-glass or grouped spices is invented.

The structured name is an index for the reference item; sourceText comparison still protects qualifiers and secondary measures. Named groups preserve their source order. Summer preparation remains one shared paragraph rather than an invented step breakdown; pasta keeps the source's numbered steps. `footnotes` retain substitutions and starred notes, outside the required ingredient list.

Known traps for review:

- The source may pair gram values with surprising household quantities. Preserve both rather than silently fixing the author.
- Water can appear only in instructions; retain it there instead of inventing an ingredient-list entry.
- The salad sauce heading belongs to each variant, not a fourth variant.
- Sweetness or a title containing “dessert” does not override an explicit second-breakfast category.
- Printed footer labels are not a substitute for PDF page positions.

## Running validation

Run `npm run pdf:fixtures` from the repository root. Node 24 and Poppler's `pdfinfo`/`pdftotext` must be available.
It verifies actual file hashes, lengths and page counts, the JSON schema, pinned reference hashes, reference structure and source anchors.
Missing PDFs/references/tools fail explicitly; the command does not download inputs, generate replacements or mark a pending review approved.
`npm run test:pdf` uses synthetic fixtures and does not need private ebooks, account credentials or network access.

On another checkout, restore the exact original PDFs under the manifest paths and securely copy the reviewed local reference JSON; the ignored source-derived artifacts are deliberately not recoverable from Git.
Any reference correction invalidates its old hash and requires review of the new bytes. Update the manifest hash only after checking the correction; never “refresh” hashes merely to hide a mismatch.

## User review gate

Compare all nine recipes in the visual/Markdown view with the original pages. Verify every title, ingredient amount/unit, labelled variant, instruction, serving note, footnote, category and page.
The user explicitly approved both references on 2026-09-30; review.status is approved and Progress 1.3 is checked.
Only approval metadata changed after review; recipe content is unchanged. The manifest and local views identify the updated files.

- summer: reviewed draft SHA-256 c70e35413ea05b8647a901f658f361507842988d0785c31d2eae2ecd5e4c0c8a; approved file SHA-256 b36c4f40f86b022d99f512e0b46e8ca56718ddc7ec3228359a240d56d1ebd8d4.
- pasta: reviewed draft SHA-256 cdb4df44a491a9298f8529c17ada8afefb92aac32311bd5202fc16715b5424e7; approved file SHA-256 59f28979bb38ba24c7a2a08c9bbade4b89ef6b26a988fc0e525a78f0c29a1227.

# Ebook review and accepted Dishly import flow

Date: 2026-09-23. Status: accepted local reading → backend → AI → validation and saving flow. This replaces the earlier proposal to recognize recipes using only local rules. Provider/model and costs remain open; PRD limits remain 20 MB / 100 pages.

## Inspected files

The files were read locally from the Pobrane directory. They were not sent to an external extraction provider. Sizes are given in decimal MB.

| File | Bytes | MB | Pages | Pages with a preparation heading | Full-document UTF-8 text |
| --- | ---: | ---: | ---: | ---: | ---: |
| LETNI-DZIEN-PROBNY.pdf | 16593596 | 16.59 | 16 | 4 | 18165 B |
| Niski indeks glikemiczny - niska waga.pdf | 10662733 | 10.66 | 113 | 100 | 80064 B |
| MINI-E-BOOK-MAKARONOWY-2kbhp6.pdf | 12689424 | 12.69 | 12 | 5 | 14215 B |

None of the specified files is 133 MB. All have a readable recipe text layer. A cover or photo page without text does not mean the entire book needs OCR. The counts 4/100/5 describe detected recipe pages; they do not guarantee correct extraction of every field.

Method: pdfinfo, pdftotext -layout for all pages, heading/section review, and visual inspection of PDF pages: summer 7, low glycemic index 41, pasta 4. Text reading alone took approximately 0.02–0.13 s per document in individual local runs. This measures Poppler on this computer, not a browser, phone, Cloudflare or the full import. Every ingredient was not validated against images of all pages. The tools reported non-blocking metadata/font warnings.

## Layout implications

- **Summer ebook:** recipes on PDF pages 7, 9, 11, 13. Four dishes, each with three ingredient-quantity columns and shared instructions. Substitutions, photos and the shopping list are separate. Do not merge quantities from the three columns. Accepted: four cards, each preserving three labelled variant blocks and shared instructions, without a calorie calculator or arbitrarily dropping two variants. Data-representation details belong to planning.
- **Low glycemic index ebook:** 100 recipe pages; 30 breakfasts, 30 lunches, 30 dinners and 10 desserts according to source sections. Most have readable headings; two ingredient columns, meat/vegetarian variants and decorative text occur. Do not treat the table of contents as recipes or automatically turn a variant into a second card. Preserve alternatives in the content without treating substitutions as required ingredients. The document exceeds the current 100-page limit despite its small file size.
- **Pasta ebook:** five recipe pages (4, 6, 8, 9, 11), with ingredients on the left and preparation on the right. Preserve the two-serving information and footnotes; do not merge both columns in horizontal row order. Photo pages 5, 7, 10 have no text and are not separate recipes.
- **Categories:** proposal to prioritize the category stated in the source. Sweet/savory breakfasts → breakfast; sweet/savory dinners → dinner; lunches → lunch; desserts → dessert. Second breakfast needs an explicit rule; the proposed mapping is breakfast. Do not infer “dessert” solely from a sweet title in the dinner section. These rules are proposals, not an accepted PRD change.
- **Source:** record the 1-based PDF page number; the printed footer number may differ. For example, the summer ebook's shopping list is on PDF page 14 but has printed page number 8.

## Accepted MVP flow

1. **Browser:** the user logs in and selects a PDF. The app checks the 20 MB / 100-page limits and text readability. The original PDF stays on the device.
2. **Browser:** reads text with positions, column boundaries and page numbers; shows progress. It does not convert the entire book into images for OCR.
3. **Backend:** checks the session and its own request/import limits, receives text with layout/page context, and sends bounded portions to AI. The provider key stays server-side.
4. **AI:** recognizes recipe boundaries, titles, ingredients, instructions, variants and category; distinguishes editorial content and shopping lists from recipes. It does not determine ownership or save data.
5. **Backend:** validates required fields, allowed categories and references to supplied pages. Ownership comes from the session. Writes are idempotent; saved-recipe counts represent confirmed writes.
6. **UI and database:** complete results save automatically; detected incomplete ones remain outside the collection pending keep/discard. No approval of every recipe or editing during import is added. Complete extraction failure saves no result.
7. **User:** sees “Reading PDF”, “Recognizing recipes” and “Saving results”, followed by saved-recipe and pending-decision counts. Proceeds to the collection and filters; later editing, reading and deletion do not require AI.

For the summer ebook, we expect four cards with three labelled ingredient variants and shared instructions. Having every field present does not prove that quantities are correct or every recipe was found; completeness is not promised based solely on the AI response.

Internet connectivity and an open tab are required to complete import. The original PDF stays on the device, but text with necessary context reaches the AI provider through the backend. On completion, failure or cancellation, the app releases temporary data without deleting the user's original file. Closing the tab does not guarantee cancellation of an already submitted AI call or provider-side deletion; interruption handling must account for already confirmed writes.

PDF.js is a candidate for local reading; it does not recognize recipes itself: [examples](https://mozilla.github.io/pdf.js/examples/), [getTextContent](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html). AI handles recognition. Provider/model, spending limits and text-use/retention terms remain to be selected. Free hosting does not automatically mean free AI calls.

## Checks before implementation and release

- Start with the five pasta recipes: verify all ingredients, units, quantities, instructions and source pages, without mixing columns.
- Next, check the large ebook's 100 recipe pages, including variants and correct exclusion of the table of contents. Verify every field against the source; the current detection of 100 headings is not such a test.
- Finally, check the four summer dishes with three variants; ensure no variants are lost and quantities are not mixed.
- Measure memory, responsiveness and total time from reading to saving in desktop and mobile browsers; test interruption, retry and account isolation. Separately measure validation/persistence CPU on the actual hosting platform.
- Agree on a page-limit change: 150 instead of 100 is recommended, keeping 20 MB, to accept the entire 113-page ebook. Under the current PRD, the alternative is rejecting the file with a clear message. Do not raise the limit to 133 MB based on these samples.
- Preserving three variants on one card has been accepted; verify it against the source. Mapping categories outside the four basic categories remains a proposal to clarify during planning. The PRD, tech-stack, deployment documents and F-01 have been updated; the feature has not yet been implemented.

## Conclusion

Local text reading and backend-mediated AI recipe recognition have been accepted, with validation and persistence controlled by code. This does not require uploading original PDFs or choosing a paid PDF-parsing server. It does not, however, establish zero cost for the entire feature, extraction correctness or completion of F-01. The next decision concerns the AI provider/model, costs and text-processing terms.

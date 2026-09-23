---
project: "Dishly"
version: 3
status: draft
created: 2026-09-18
updated: 2026-09-23
context_type: greenfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

The creator owns many cooking ebooks but often does not know what to cook when it is time for lunch or dinner. Opening and browsing each ebook separately is time-consuming and discouraging. Finding recipes that use an ingredient already in the fridge requires searching the books one by one.

The app should bring these recipes into one searchable collection so the creator can find meal ideas by meal type or an ingredient already available. Single-ingredient filtering and finding a meal for today are sufficient for the first version. The same extraction, completeness, and filtering rules would apply if the app grew to 100 users.

## User & Persona

The primary user is the creator, who owns cooking ebooks, mostly PDFs, and wants to choose lunch or dinner or use up an ingredient in the fridge.

The creator expects to be the only user initially. Registration remains open to others, with private recipe collections per account.

## Success Criteria

### Primary

- A user can register, log in, select a cooking PDF with selectable text for local reading, and have its recipes extracted and categorized by AI from text sent through the backend; complete recipes save to their private collection without approval, while detected incomplete recipes await a keep-or-discard decision.
- Full import success means all recipes from the PDF are extracted and saved correctly. An import with one or two detected incomplete recipes produces a warning rather than full success.
- The user can find a recipe for today's meal by category or a single ingredient, combine both filters to find recipes containing the ingredient within the selected category, and select a recipe to cook. Each recipe has exactly one assigned category: breakfast, lunch, dinner, or dessert; category filtering uses this assignment.
- A user can correct the title, ingredients, and preparation instructions of an already saved recipe and delete an already saved recipe they own. These are MVP capabilities; manual category changes remain excluded.

### Secondary

- Editing incomplete recipes directly during import remains a possible future improvement, not part of the MVP.

### Guardrails

- Each user can view, edit, or delete only their own recipes. PDFs are read locally in the browser and are not uploaded to the backend or AI provider. App-held temporary PDF data is released after extraction, failure, or cancellation; the original file on the user's device is not deleted.
- Complete extraction failure displays an error and saves no result. Detected incomplete recipes are clearly marked with a warning indicating what may be missing; complete recipes save automatically, while detected incomplete recipes wait for the user to keep or discard them. Detection is not guaranteed; undetected omissions may only be noticed by the user later, and the owner can correct recipe content after it has been saved using MVP editing.

## User Stories

### US-01: Import a cooking ebook successfully

- **Given** a user with a PDF containing 50 breakfast recipes, including sweet and savory options with different calorie values
- **When** the user selects the PDF in the application and keeps the tab open while local reading, AI extraction, and saving finish
- **Then** all 50 recipes are extracted and saved correctly, and the user sees a toast stating that 50 recipes were saved, without claiming that the app has independently verified every source recipe was found.

#### Acceptance Criteria

- Full success in the example test requires all 50 recipes from the PDF to be extracted and saved correctly.
- The import message reports “Saved X recipes” and, when applicable, a warning stating “Y recipes require a decision”; it does not claim that no source recipes were omitted.
- Automatic saving requires a title, a non-empty ingredient list, preparation instructions, a meal category, and source metadata containing the original filename and page number. If any required content is missing, the recipe requires a keep-or-discard decision.
- If most recipes are extracted successfully but one or two are detected as incomplete, show a warning instead of presenting the import as full success.
- Clearly mark detected incomplete recipes and await the user’s keep-or-discard decision before saving them; complete recipes save automatically.
- Kept incomplete recipes can be corrected by their owner after saving through MVP editing of title, ingredients, and preparation instructions; editing within the import flow is excluded.

- The browser reads text with layout/column context and page numbers; the backend alone calls AI and validates the response before saving.
- For LETNI-DZIEN-PROBNY, the expected result is four recipe cards, each preserving three separately labelled ingredient-quantity variants and shared preparation instructions. Never merge quantities or silently select one variant. This is an additional source-specific acceptance case, not a replacement for the 50-recipe test.
- Progress distinguishes local reading, recipe recognition, and saving. A successful count includes only confirmed saved recipes. Missing fields require a keep-or-discard decision; presence of all fields does not prove extraction accuracy.

Sweet/savory options and calorie values describe sample input; no new filtering requirements have been agreed from this example.

### US-02: Find and read a meal from an imported ebook

- **Given** a registered and logged-in user and a representative text-based PDF containing known recipes
- **When** the user selects the PDF, local reading and AI extraction finish successfully, the recipes are saved, and the user selects one meal category and enters one ingredient
- **Then** only recipes matching both the selected category and ingredient are shown, and the user can open one matching recipe and read it.

#### Acceptance Criteria

- Exercise the full user flow: register/login → select PDF → read locally → AI extraction via backend → validate/save → filter → open recipe.
- Results belong to the logged-in user and match both the single assigned meal category and the single searched ingredient.
- Polish ingredient matching handles common inflected forms across grammatical case, number, and capitalization: `pomidor` matches `pomidory`, `pomidora`, and `pomidorów`, including capitalization differences.
- `pomidor` does not automatically match `passata` or `ketchup`; related ingredients and substitutions remain distinct.
- The user can open a matching recipe and read its title, ingredients, and preparation instructions.
- This scenario is separate from US-01, which checks that all 50 recipes in a known source PDF are correctly extracted and saved.

### US-03: Correct an already saved recipe

- **Given** a logged-in user with a saved recipe they own
- **When** the user edits its title, ingredients, or preparation instructions and saves the changes
- **Then** the saved recipe shows the corrected content.

#### Acceptance Criteria

- Editing is available only after the recipe has been saved, including an incomplete recipe the user chose to keep.
- Another user's recipe cannot be edited.
- Editing does not offer manual meal-category changes and is not available during import.

### US-04: Delete an already saved recipe

- **Given** a logged-in user with a saved recipe they own
- **When** the user deletes the recipe
- **Then** it is removed from their saved collection and no longer appears in their browsing or filtering results.

#### Acceptance Criteria

- Deletion applies to already saved recipes, separately from discarding incomplete recipes during import.
- Another user's recipe cannot be deleted.

## Functional Requirements

### Accounts

- FR-001: Anyone can register and log in with email and password to a private account with access only to their own extracted recipes. Priority: must-have
  > Socratic: Counter-argument considered: Open registration adds work beyond personal use. Resolution: Keep open registration and private collections.

### Import

- FR-002: A logged-in user can select a cooking PDF with selectable text for local browser reading, with at most 100 pages and 20 MB per file, see progress, and see a clear error if either limit is exceeded or the text cannot be read; the original PDF is not uploaded. Priority: must-have
  > Socratic: Counter-argument considered: Large ebooks could make imports too slow. Resolution: Limit each PDF to 100 pages and 20 MB; show a clear error if either limit is exceeded.
- FR-003: A user can have recipes extracted by AI from locally read PDF text sent through the backend, assigned to exactly one category (breakfast, lunch, dinner, or dessert), with complete recipes saved automatically without approval and an import message reporting the number saved without claiming all source recipes were found. Priority: must-have
  > Socratic: Counter-argument considered: A recipe can suit multiple meal categories. Resolution: Keep exactly one meal category per recipe in the first version; category filtering uses that single assignment.
- FR-004: A user can see an error when extraction fails completely, with no result saved and app-held temporary PDF data released, and retry by selecting the local PDF again; the original file remains on their device. Priority: must-have
  > Socratic: Counter-argument considered: An error alone leaves users stuck. Resolution: Retry after complete failure requires selecting the local PDF again because app-held temporary input is released.
- FR-005: A user can see clearly marked incomplete recipes with warnings identifying what may be missing and the number of recipes requiring a decision, and choose whether to keep (save) or discard them during the import flow before they enter the saved collection. Priority: must-have
  > Socratic: Counter-argument considered: Keep-or-discard decisions may interrupt the user. Resolution: Keep the decision within the import flow; returning to pending decisions later is not required.

### Finding meals

- FR-006: A user can browse their recipes and filter by the single assigned meal category and a single ingredient, including combining both filters so results match both conditions; ingredient matching recognizes common inflected forms of Polish ingredient names, including grammatical case, number, and capitalization differences, but does not equate related ingredients or substitutions. Priority: must-have
  > Socratic: Counter-argument considered: Polish ingredient names vary by grammatical case, number, and capitalization. Resolution: Match common inflected forms (`pomidor`, `pomidory`, `pomidora`, `pomidorów`), but do not equate `pomidor` with `passata` or `ketchup`; related ingredients and substitutions remain distinct.
- FR-007: A user can open a selected recipe to cook from and see the original PDF filename and page number as source metadata. Priority: must-have
  > Socratic: Counter-argument considered: Extraction may omit cooking details. Resolution: Show the original filename and page number so the user can consult their own copy; the PDF is not retained in the app.

### Saved recipe management

- FR-008: A logged-in user can edit the title, ingredients, and preparation instructions of an already saved recipe they own, without manually changing its meal category or editing during import. Priority: must-have
  > Socratic: Counter-argument considered: Incorrect recipes could make the first version frustrating without editing. Resolution: The user's final adjustment brings basic editing of saved recipes into the MVP; editing during import and manual category changes remain excluded.
- FR-009: A logged-in user can delete an already saved recipe they own, removing it from their collection and browsing/filtering results, but cannot delete another user's recipe. Priority: must-have
  > Decision: Explicitly added by the user in the final scope adjustment to provide deletion of saved recipes; this is distinct from discarding an incomplete recipe during import.

## Non-Functional Requirements

- Processing a representative PDF containing about 50 recipes finishes within five minutes (absolute maximum, not an average), measured from the start of local text reading through AI processing, validation, and confirmed saving, excluding file selection and user keep-or-discard decisions. This is an accepted requirement, not measured performance.
- Filtering results appear within one second for a collection of up to 1,000 recipes with one active user. This is an accepted requirement, not measured performance.
- The original PDF stays on the user's device; only extracted text and necessary layout/page context are sent through the backend to the AI provider. App-held temporary input is released after success, failure, or cancellation; saved recipes remain in the private account. Provider retention and data-use terms must be selected explicitly; local cleanup does not guarantee provider-side deletion.
- Recipe collections remain private to their owners; users cannot access another user's import text, results, or saved recipes.
- The main flow (registration/login, local PDF reading, AI processing, import results and keep-or-discard decisions, filtering, and reading recipes) is usable in current versions of the two agreed mainstream browsers on desktop and mobile with a responsive layout.

## Business Logic

An extracted recipe is saved automatically only if it contains a title, a non-empty ingredient list, preparation instructions, a meal category, and source metadata containing the original filename and page number; if any required content is missing, it is treated as incomplete and requires a keep-or-discard decision.

Source references consist of the original PDF filename and page number stored with each recipe. Source page numbers are the 1-based PDF page positions, not necessarily printed page labels. The original PDF remains local; app-held temporary data is released after success, failure, or cancellation, and retry requires selecting the file again.

The input is recipe content extracted from the user's cooking PDF with selectable text. Complete recipes enter the user's private collection automatically. Detected incomplete recipes are clearly marked with a warning identifying missing content and wait within the import flow for the user to keep (save) or discard them. After saving, only the owner may edit the title, ingredients, and preparation instructions or delete the recipe from their collection. This also permits correcting a kept incomplete recipe. Editing during import and manual category changes remain excluded.

Each recipe is assigned exactly one meal category: breakfast, lunch, dinner, or dessert. Filtering uses that single assigned category and can be combined with a single ingredient filter. Ebooks are primarily in Polish. Ingredient matching recognizes common inflected forms of Polish ingredient names, including grammatical case, number, and capitalization differences, without treating related ingredients or substitutions as equivalent: `pomidor` matches `pomidory`, `pomidora`, and `pomidorów`, but does not automatically match `passata` or `ketchup`. Presence of the required content does not guarantee extraction accuracy: full import success requires all source recipes to be correctly extracted and saved, while undetected omissions may only be noticed later by the user. Import messages report saved counts and counts awaiting a decision, without claiming all source recipes were found.

### Accepted import responsibilities — 2026-09-23

The user accepted this MVP flow: choose PDF → local browser text reading → backend-mediated AI recipe recognition → backend validation → automatic saving of complete recipes / keep-or-discard for detected incomplete recipes → browsing and filtering.

- **Browser:** check the selected file against the existing 20 MB / 100-page limits and text readability; extract text with layout, column and page context, show progress, and keep the original PDF local. Internet connectivity and an open tab are required until import finishes; completion after closing the tab is not an MVP promise.
- **Backend:** authenticate the user, enforce request/import limits, send bounded portions of extracted text to AI, keep the provider credential server-side, validate returned fields/categories/source-page references, and control ownership and persistence. Neither browser input nor model output is trusted.
- **AI:** interpret recipe boundaries, titles, ingredient lists, instructions, variants and one of the four allowed meal categories. Ignore editorial pages and shopping lists as recipe candidates. AI cannot assign ownership or write directly to the database.
- **Persistence/UI:** save complete validated recipes automatically, hold detected incomplete results outside the collection until keep/discard, and report confirmed saved/pending counts. Repeated requests must not duplicate recipes.
- **Variants:** preserve the summer ebook's three labelled ingredient blocks on one card per dish with shared instructions. No calorie calculator, dietary filter, or automatic portion conversion is introduced.
- **Lifecycle:** release app-held temporary PDF/text data on completion, failure or cancellation; retain saved recipes and source filename/page metadata. Closing the tab is not proof that an already submitted provider call was cancelled or its data deleted. Cancellation/retry handling must reconcile any confirmed writes.
- **Scope:** AI is used for import; browsing, filtering, editing and deletion use ordinary application logic. The provider/model, spending limits and provider data-use/retention terms remain open. Accepting this flow does not approve a paid service or increase PDF limits.

## Access Control

Anyone can register and log in with email and password to a private account. Each user can view, edit, and delete only their own saved recipes; editing and deleting another user’s recipes are prohibited. PDFs are read locally in the browser and are not uploaded to the backend or AI provider. App-held temporary PDF data is released after extraction, failure, or cancellation; the original file on the user's device is not deleted.

Users have no stored ebook library to view or delete. The PDF is local extraction input; only text/layout context is sent for AI processing, and retained recipes remain private to the account owner.

Registration and login use email and password.

An unauthenticated visitor who opens a protected application screen is redirected to the login screen. Confirmed by the user on 2026-09-23. Private data remains inaccessible without authentication.

## Non-Goals

- Storing ebooks on the server or providing an ebook library is excluded; app-held temporary PDF data is released after processing, failure, or cancellation without deleting the user's original file.
- Scanned-PDF support is excluded from the first version to simplify extraction.
- Approval of complete recipes is excluded from the first version; only detected incomplete recipes require a keep-or-discard decision before saving.
- Editing during import is excluded from the MVP; basic editing of an already saved recipe is included.
- Manual and automatic meal planning are excluded; the first version focuses on finding today’s meal.
- Calorie targets, nutrition calculations, and dietary filtering are excluded to keep the initial scope focused on category and ingredient filtering.
- Title search and user changes to recipe categories are excluded to keep the first version small.
- Recipe sharing and public collections are excluded; collections are private.

## Open Questions

1. Should a later iteration allow editing incomplete recipes directly during import? — Owner: user; tentative future idea, not committed scope.
2. Does the revised three-week estimate provide enough time for the full MVP after adding basic saved-recipe editing and deletion? — Owner: user; validate during implementation planning. Consequence: implementation planning may still require a smaller delivery slice if the estimate proves too tight.

3. Which AI provider/model, import spending limits, and text retention/data-use terms should be used for the accepted browser → backend → AI flow? — Owner: user; blocks live AI integration and final extraction validation.

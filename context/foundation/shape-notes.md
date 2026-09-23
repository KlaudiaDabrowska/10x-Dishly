---
project: "Dishly"
context_type: greenfield
created: 2026-09-17
updated: 2026-09-23
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 2
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: Project name
      decision: Dishly
    - topic: Additional MVP exclusions
      decision: Exclude manual and automatic meal planning; calorie targets, nutrition calculations, and dietary filtering; title search and user category changes; recipe sharing and public collections.
    - topic: Primary persona
      decision: The app is primarily for the creator's personal use.
    - topic: Ingredient filtering
      decision: Filter by a single ingredient in the first version.
    - topic: Ebook language
      decision: Ebooks will primarily be in Polish.
    - topic: Ingredient matching
      decision: Match common inflected forms of Polish ingredient names, including grammatical case, number, and capitalization differences; related ingredients and substitutions remain distinct.
    - topic: Combined filters
      decision: Users can select a category and filter recipes within it by a single ingredient; both conditions must match.
    - topic: First useful outcome
      decision: Finding a meal for today is enough for the first version.
    - topic: Login method
      decision: Email and password for registration and login.
    - topic: Access control
      decision: Anyone can register and log in with email and password to a private account; each user sees only their own recipes. Uploaded PDFs are used only for extraction and deleted immediately after extraction, including when import fails.
    - topic: Upload limits
      decision: At most 100 pages and 20 MB per PDF; show a clear error if either limit is exceeded. Performance remains to be tested.
    - topic: PDF support
      decision: Only PDFs with selectable text are supported in the first version.
    - topic: Extraction approval
      decision: Complete recipes save automatically; detected incomplete recipes wait for an explicit keep-or-discard decision before being added to the collection.
    - topic: Categories
      decision: Each recipe has exactly one assigned meal category in the first version, chosen from breakfast, lunch, dinner, and dessert; filtering uses that single assigned category.
    - topic: Detected incomplete recipes
      decision: Clearly mark detected incomplete recipes and show a warning; keep saves the recipe, discard excludes it, and undecided recipes wait outside the saved collection.
    - topic: Import status messaging
      decision: Show the saved-recipe count and, when applicable, a warning with the count awaiting a keep-or-discard decision; do not claim every source recipe was found. The 50-recipe test still requires all 50 recipes to be extracted and saved correctly.
    - topic: Full import success
      decision: All recipes from the PDF must be extracted and saved correctly; an import with incomplete recipes is a warning outcome, not full success.
    - topic: Recipe completeness
      decision: Automatic saving requires a title, a non-empty ingredient list, preparation instructions, a meal category, and source metadata containing the original filename and page number; any missing required content triggers a keep-or-discard decision.
    - topic: Saved recipe management
      decision: MVP users can edit the title, ingredients, and preparation instructions of their own saved recipes and delete their own saved recipes; editing during import and manual category changes remain excluded.
    - topic: Milestone estimate
      decision: Two weeks at 4–6 hours per week, including registration and login; accepted on 2026-09-18.
    - topic: Work schedule
      decision: The project will be developed outside the user's regular job.
    - topic: Product type
      decision: A web app supporting current Chrome and Firefox versions, with a responsive main flow usable on mobile devices as well as desktop.
    - topic: Initial audience
      decision: The creator expects to be the only initial user; open registration remains enabled.
    - topic: Product rules at larger scale
      decision: The same extraction, completeness, and filtering rules would apply at 100 users.
    - topic: PDF retention
      decision: PDFs are used only for extraction and deleted immediately after extraction, including when import fails; only extracted recipes are retained in user accounts. This supersedes ebook storage and user-managed ebook deletion.
    - topic: Source metadata
      decision: Retain the original PDF filename and page number with the recipe; do not retain the PDF itself.
    - topic: Failed-import retry
      decision: Delete the temporary PDF on import failure too; retry requires uploading it again.
    - topic: Filtering response time
      decision: Filtering results appear within one second for up to 1,000 saved recipes with one active user.
    - topic: Import performance
      decision: Processing a representative PDF of about 50 recipes must finish within five minutes as an absolute maximum, excluding upload time and user keep-or-discard decisions; performance is not yet validated.
  frs_drafted: 9
  quality_check_status: warned
---

## Accepted follow-up decisions — 2026-09-23

This section records the user's later decisions and supersedes conflicting original shaping statements below. [PRD v3](prd.md) is the current product contract; the original discovery record remains for provenance.

- An unauthenticated visitor opening a protected screen is redirected to login.
- The browser reads the selected PDF locally with text, layout/column context and 1-based PDF page numbers. The original PDF is not uploaded or deleted from the user's device.
- The authenticated backend sends bounded text/context portions to AI, keeps its credential server-side, enforces limits, validates results and owns private persistence. AI recognizes recipes and their fields; it cannot assign ownership or write directly to the database.
- Complete validated recipes save automatically; detected incomplete recipes require keep/discard. Progress distinguishes reading, recognition and saving; counts refer to confirmed saves and do not guarantee no recipe was missed.
- For the summer ebook, preserve four recipe cards with three labelled ingredient-quantity variants per card and shared instructions; no calorie calculator or arbitrary choice of one variant.
- Internet and an open tab are required until completion. Release app-held temporary data on success, failure or cancellation, leaving the original file untouched. No promise of continued import after the tab closes.
- AI is part of import only. Provider/model, spending limits and provider data-use/retention terms remain undecided; acceptance did not approve paid services.
- Limits remain 20 MB / 100 pages. Raising the limit to 150 pages and mapping non-standard source categories were earlier proposals, not decisions made by accepting this flow.

## Seed idea

Original seed retained verbatim for provenance; the agreed MVP and exclusions below supersede its tentative scope.

personal recipe aggregator that extracts and categorizes recipes from cooking PDFs, supports browsing and filtering, and helps users create meal plans. Explore an MVP suitable for 4–6 hours per week. Proposed scope reductions—not yet accepted—are text-based PDFs and manual meal planning first. Resolve scanned-PDF support, extraction review, nutrition data availability, and when to introduce automatic planning.

## Vision & Problem Statement

The creator owns many cooking ebooks but often does not know what to cook when it is time for lunch or dinner. Opening and browsing each ebook separately is time-consuming and discouraging. Finding recipes that use an ingredient already in the fridge requires searching the books one by one.

The app should bring these recipes into one searchable collection so the creator can find meal ideas by meal type or an ingredient already available. Single-ingredient filtering and finding a meal for today are sufficient for the first version.

The same extraction, completeness, and filtering rules would apply if the app grew to 100 users.

## User & Persona

The primary user is the creator, who owns cooking ebooks, mostly PDFs, and wants to choose lunch or dinner or use up an ingredient in the fridge.

The creator expects to be the only user initially. Registration remains open to others, with private recipe collections per account.

## Success Criteria

### Primary
- A user can register, log in, upload a cooking PDF with selectable text, and have its recipes automatically extracted and categorized; complete recipes save to their private collection without approval, while detected incomplete recipes await a keep-or-discard decision.
- Full import success means all recipes from the PDF are extracted and saved correctly. An import with one or two detected incomplete recipes produces a warning rather than full success.
- The user can find a recipe for today's meal by category or a single ingredient, combine both filters to find recipes containing the ingredient within the selected category, and select a recipe to cook. Each recipe has exactly one assigned category: breakfast, lunch, dinner, or dessert; category filtering uses this assignment.

- A user can correct the title, ingredients, and preparation instructions of an already saved recipe and delete an already saved recipe they own. These are MVP capabilities; manual category changes remain excluded.

### Secondary
- Editing incomplete recipes directly during import remains a possible future improvement, not part of the MVP.

### Guardrails
- Each user can view, edit, or delete only their own recipes. PDFs are used only for extraction and deleted immediately after extraction, including when import fails.
- Complete extraction failure displays an error and saves no result. Detected incomplete recipes are clearly marked with a warning indicating what may be missing; complete recipes save automatically, while detected incomplete recipes wait for the user to keep (save) or discard them. Detection is not guaranteed; undetected omissions may only be noticed by the user later, and the owner can correct recipe content after it has been saved using MVP editing.

## User Stories

### US-01: Import a cooking ebook successfully

- **Given** a user with a PDF containing 50 breakfast recipes, including sweet and savory options with different calorie values
- **When** the user uploads the PDF to the application
- **Then** all 50 recipes are extracted and saved correctly, and the user sees a toast stating that 50 recipes were saved, without claiming that the app has independently verified every source recipe was found.

#### Acceptance Criteria
- Full success in the example test requires all 50 recipes from the PDF to be extracted and saved correctly.
- The import message reports “Saved X recipes” and, when applicable, a warning stating “Y recipes require a decision”; it does not claim that no source recipes were omitted.
- Automatic saving requires a title, a non-empty ingredient list, preparation instructions, a meal category, and source metadata containing the original filename and page number. If any required content is missing, the recipe requires a keep-or-discard decision.
- If most recipes are extracted successfully but one or two are detected as incomplete, show a warning instead of presenting the import as full success.
- Clearly mark detected incomplete recipes and await the user’s keep-or-discard decision before saving them; complete recipes save automatically.
- Kept incomplete recipes can be corrected by their owner after saving through MVP editing of title, ingredients, and preparation instructions; editing within the import flow is excluded.

Sweet/savory options and calorie values describe sample input; no new filtering requirements have been agreed from this example.

### US-02: Find and read a meal from an imported ebook

- **Given** a registered and logged-in user and a representative text-based PDF containing known recipes
- **When** the user uploads the PDF, extraction finishes successfully, the recipes are saved, and the user selects one meal category and enters one ingredient
- **Then** only recipes matching both the selected category and ingredient are shown, and the user can open one matching recipe and read it.

#### Acceptance Criteria
- Exercise the full user flow: register/login → upload → extract → save → filter → open recipe.
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
- FR-002: A logged-in user can upload a cooking PDF with selectable text, with at most 100 pages and 20 MB per file, and see a clear error if either limit is exceeded. Priority: must-have
  > Socratic: Counter-argument considered: Large ebooks could make imports too slow. Resolution: Limit each PDF to 100 pages and 20 MB; show a clear error if either limit is exceeded.
- FR-003: A user can have recipes extracted from their uploaded PDF, assigned to exactly one category (breakfast, lunch, dinner, or dessert), with complete recipes saved automatically without approval and an import message reporting the number saved without claiming all source recipes were found. Priority: must-have
  > Socratic: Counter-argument considered: A recipe can suit multiple meal categories. Resolution: Keep exactly one meal category per recipe in the first version; category filtering uses that single assignment.
- FR-004: A user can see an error when extraction fails completely, with no result saved and the temporary PDF deleted, and retry extraction by uploading the PDF again. Priority: must-have
  > Socratic: Counter-argument considered: An error alone leaves users stuck. Resolution: Retry after complete failure requires a fresh upload because the temporary PDF is deleted.
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

- Processing a representative PDF containing about 50 recipes finishes within five minutes (absolute maximum, not an average), excluding upload time and user keep-or-discard decisions. This is an accepted requirement, not measured performance.
- Filtering results appear within one second for a collection of up to 1,000 recipes with one active user. This is an accepted requirement, not measured performance.
- Uploaded PDFs are used only for extraction and deleted immediately after extraction, including when import fails; only extracted recipes are retained in user accounts.
- Recipe collections remain private to their owners; users cannot access another user’s uploaded PDF during processing.
- The main flow (registration/login, PDF upload, import results and keep-or-discard decisions, filtering, and reading recipes) is usable in current versions of Chrome and Firefox on desktop and mobile with a responsive layout.

## Business Logic

An extracted recipe is saved automatically only if it contains a title, a non-empty ingredient list, preparation instructions, a meal category, and source metadata containing the original filename and page number; if any required content is missing, it is treated as incomplete and requires a keep-or-discard decision.

Source references consist of the original PDF filename and page number stored with each recipe. The PDF itself is deleted immediately after extraction, including on failure; retry requires a fresh upload.

The input is recipe content extracted from the user's cooking PDF with selectable text. Complete recipes enter the user's private collection automatically. Detected incomplete recipes are clearly marked with a warning identifying missing content and wait within the import flow for the user to keep (save) or discard them. After saving, only the owner may edit the title, ingredients, and preparation instructions or delete the recipe from their collection. This also permits correcting a kept incomplete recipe. Editing during import and manual category changes remain excluded.

Each recipe is assigned exactly one meal category: breakfast, lunch, dinner, or dessert. Filtering uses that single assigned category and can be combined with a single ingredient filter. Ebooks are primarily in Polish. Ingredient matching recognizes common inflected forms of Polish ingredient names, including grammatical case, number, and capitalization differences, without treating related ingredients or substitutions as equivalent: `pomidor` matches `pomidory`, `pomidora`, and `pomidorów`, but does not automatically match `passata` or `ketchup`. Presence of the required content does not guarantee extraction accuracy: full import success requires all source recipes to be correctly extracted and saved, while undetected omissions may only be noticed later by the user. Import messages report saved counts and counts awaiting a decision, without claiming all source recipes were found.

## Access Control

Anyone can register and log in with email and password to a private account. Each user can view, edit, and delete only their own saved recipes; editing and deleting another user’s recipes are prohibited. PDFs are used only for extraction and deleted immediately after extraction, including when import fails.

Users have no stored ebook library to view or delete. The PDF is temporary extraction input; retained recipes remain private to the account owner.

Registration and login use email and password.

## Non-Goals

- Storing ebooks or providing an ebook library with user-managed deletion is excluded; PDFs are deleted immediately after extraction, including on failure.
- Scanned-PDF support is excluded from the first version to simplify extraction.
- Approval of complete recipes is excluded from the first version; only detected incomplete recipes require a keep-or-discard decision before saving.
- Editing during import is excluded from the MVP; basic editing of an already saved recipe is included.

- Manual and automatic meal planning are excluded; the first version focuses on finding today’s meal.
- Calorie targets, nutrition calculations, and dietary filtering are excluded to keep the initial scope focused on category and ingredient filtering.
- Title search and user changes to recipe categories are excluded to keep the first version small.
- Recipe sharing and public collections are excluded; collections are private.

## Open Questions

1. Should a later iteration allow editing incomplete recipes directly during import? — Owner: user; tentative future idea, not committed scope.

2. Does the accepted two-week estimate still hold after adding basic saved-recipe editing and deletion to the MVP? — Owner: user; revisit before implementation planning. The estimate is preserved, not silently extended.

## Planning context

The user can dedicate 4–6 hours per week. November 4, 2026 is a preferred completion date, not a hard deadline; later completion is acceptable. The accepted first milestone estimate is two weeks, including authentication; this is the initial delivery estimate recorded in timeline_budget.mvp_weeks, not an estimate for later enhancements. The final scope adjustment adds saved-recipe editing and deletion; the original estimate is retained and its applicability to the expanded MVP remains an open planning question.

## Timeline acknowledgment

Acknowledged on 2026-09-18: the two-week milestone requires sustained effort at 4–6 hours per week, includes registration and login, and exceeds the one-week first-flow guideline; user accepted.

## Requirements review progress

Nine must-have functional requirements now describe the agreed MVP. FR-001 through FR-007 preserve prior decisions, with FR-006 refined to cover common Polish inflected forms across grammatical case, number, and capitalization. The user's final adjustment promotes FR-008 to basic owner-only editing of saved recipes and introduces FR-009 for owner-only deletion of saved recipes. The earlier withdrawn ebook-management draft is not part of the final FR list. The final changes are explicit user decisions; no additional challenge response is implied for FR-009.

Four user stories cover the separate 50-recipe extraction check, the complete import-to-meal-discovery flow, saved-recipe editing, and saved-recipe deletion. All earlier exclusions remain, except that basic editing after saving is now an MVP requirement. Editing during import and manual category changes remain excluded. Phase 7 was accepted on 2026-09-18 and shaping is finalized. The user accepted finishing with the timeline question recorded; the two-week estimate has not been re-estimated for the expanded scope.

## Quality cross-check

Status: finalized with warning (warned). On 2026-09-18, the user chose “Accept and finish” with the remaining timeline question recorded. No product-decision contradictions identified; the estimate for the expanded MVP remains to be reviewed before implementation planning.

| Check | Result |
| --- | --- |
| Access Control | Present: open email-and-password registration and login; only the owner may view, edit, or delete saved recipes. |
| Business Logic | Present: completeness validation, keep-or-discard import behavior, common Polish inflection matching, and owner-only management of saved recipes. |
| Project artifacts | Present: shape-notes with checkpoint, nine must-have FRs, and four user stories. |
| Meaningful data management | Present: create through extraction and saving; read through browsing, filtering, and opening; update saved recipe title/ingredients/instructions; delete owned saved recipes. |
| User-flow coverage | Present: separate 50-recipe extraction-quality scenario and register/login → upload → extract → save → filter → open recipe scenario, plus editing/deletion acceptance criteria. |
| Timeline-cost acknowledgment | Original two-week estimate at 4–6 hours per week, including authentication, is preserved; applicability after adding editing/deletion remains open. |
| Non-Goals | Present: all agreed exclusions retained except basic saved-recipe editing, now explicitly in scope; editing during import and manual category changes remain out of scope. |
| Preserved behavior | Not applicable: greenfield. |

Remaining planning gap: confirm or revise the two-week estimate for the expanded MVP before implementation planning. Performance and browser usability are requirements to validate during implementation, not verified capabilities. The scenarios are documented, not implemented or executed.

Optional editing during import remains a future idea, not an MVP blocker. Shaping was accepted and finalized on 2026-09-18; ready for /10x-prd.

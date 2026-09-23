---
project: Dishly
version: 3
status: draft
created: 2026-09-23
updated: 2026-09-23
prd_version: 3
main_goal: low-complexity
top_blocker: decisions
milestone_id: private-pdf-to-meal
milestone_seq: 1
milestone_status: open
---

# Roadmap: Dishly

> Derived from PRD v3 and the researched codebase baseline, confirmed by the user.
> Items are listed in dependency order. The "At a glance" table is their index.
> Update this document in place; when replacing it entirely, follow the foundation-document archive convention.

## Milestone

**M-1: From a personal PDF to finding meals and managing recipes** — Status: open

- **Intent:** The user can import their own ebook, find a meal and use private recipes, then correct and delete them. The first usefulness check is the complete import → filter → open recipe flow.
- **Source materials:** `context/foundation/prd.md` (v3). Supplementary materials: `context/foundation/shape-notes.md`, `context/foundation/tech-stack.md`, `context/foundation/infrastructure.md`, `context/deployment/deploy-plan.md`, `context/deployment/pdf-processing-requirements.md`, `context/foundation/lessons.md`.
- **Done when:** every F-NN and S-NN below is `done`; US-01–US-04 acceptance criteria and the PRD's non-functional requirements are met. Working diagnostics do not prove that import requirements are satisfied.
- **Scope anchors:** FR-001–FR-009, US-01–US-04; Non-Functional Requirements, Business Logic and Access Control sections.
- **Sequencing:** the user chose simplicity, US-02 as the first target flow, and the PDF-processing decision as the main risk. This is dependency ordering, without a schedule or new estimates.
- **Investment:** greater care in processing and data follows from completeness, user isolation and private text-processing requirements; UI and infrastructure remain minimal. Required safeguards, measurements and persistence are introduced in the first capability that uses them.

## Vision recap

The creator owns many cooking PDFs, but browsing each separately makes choosing lunch or dinner difficult. Dishly brings recipes into one private collection to find a meal by type or an ingredient available in the fridge. Searching by one ingredient and choosing today's meal are sufficient for the first version.

## North star

Here, "north star" means the smallest complete flow whose delivery demonstrates the product's usefulness.

**S-05: Find a meal by category and ingredient** — completes US-02 from a personal PDF to a recipe to cook from; supports the chosen simplicity goal and follows its essential prerequisites, before editing and deletion.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
| --- | --- | --- | --- | --- | --- |
| F-01 | validate-pdf-processing | (foundation) The AI provider, budget and text-processing terms have been agreed, and the accepted local-reading and AI recipe-recognition flow has been verified. | — | FR-002, FR-003, US-01; Non-Functional Requirements — import performance and text privacy | blocked |
| S-01 | private-recipe-collection | The user can use the existing registration and login, enter their own empty collection and see the no-recipes state; another user's collection remains inaccessible. | — | FR-001, FR-006, US-02; Access Control | ready |
| S-02 | import-complete-recipes | The user can select a local PDF, follow reading, AI analysis and saving of complete recipes, or see an error with no results saved after complete extraction failure and retry by selecting the file again. The original PDF stays on the device. | F-01, S-01 | FR-001, FR-002, FR-003, FR-004, US-01; Non-Functional Requirements — import, privacy and temporary-data release | proposed |
| S-03 | resolve-incomplete-recipes | The user sees missing elements in detected incomplete recipes and can keep or discard each during import; saved results and pending decisions are counted separately. | S-02 | FR-005, FR-003, US-01; Business Logic | proposed |
| S-04 | browse-and-read-recipes | The user can browse their own saved recipes and open their titles, ingredients, instructions and available source metadata: PDF filename and page number. | S-02 | FR-001, FR-006, FR-007, US-02; Non-Functional Requirements — privacy and responsiveness | proposed |
| S-05 | find-meal-from-pdf | After import, the user can find a meal by category, one ingredient or both together and open a matching recipe to cook from. | S-03, S-04 | FR-006, FR-007, US-02; Non-Functional Requirements — filtering and responsiveness | proposed |
| S-06 | edit-saved-recipe | The user can correct the title, ingredients and instructions of their own saved recipe, including one kept despite incompleteness, and read the saved corrections. | S-04 | FR-008, US-03; Access Control | proposed |
| S-07 | delete-saved-recipe | The user can delete their own saved recipe; it disappears from the collection, read access and filtering results. | S-04 | FR-009, US-04; Access Control | proposed |

## Baseline

State as of 2026-09-23, researched in the repository and confirmed by the user. Technology choices in tech-stack are not evidence of completed capabilities. Tech-stack was updated to reflect the existing Workers deployment with manual production publication. The AI decision concerns a planned feature, not an existing integration. Remote services were not reverified.

- **Frontend:** partial — Astro/React scaffold per tech-stack; account forms and a demonstration screen exist, but no recipe UI (`src/pages/dashboard.astro`).
- **Backend / API:** partial — account handling and diagnostics exist; user import and recipe operations are absent (`src/pages/api/auth/`, `src/pages/api/ops/deployment-probe.ts`).
- **Data:** partial — Supabase client and local configuration exist; migrations and a recipe model are absent (`src/lib/supabase.ts:9`, `supabase/config.toml`).
- **Auth:** present — registration, login, logout and session checks exist; the protected screen redirects unauthenticated users to login (`src/middleware.ts:31`). Protection for future recipe resources will be implemented alongside those resources.
- **Deploy / infra:** partial — application and diagnostic infrastructure exist; documentation records deployment, a queue probe and marker deletion. There is no evidence of real extraction (`context/deployment/deploy-plan.md`, `workers/pdf-consumer/index.ts`, `.github/workflows/deploy.yml`).
- **Observability:** partial — Worker observability and structured diagnostic logs exist; product-operation measurements do not yet exist (`wrangler.jsonc:12`, `workers/pdf-consumer/wrangler.jsonc:7`, `src/lib/deployment-probe.ts:27`).

Do not rebuild authentication, the queue or publication mechanisms. F-01 is limited to feasibility evidence and agreement on real-processing terms; S-02 then integrates these into a user capability.

## Foundations

### F-01: Verify real import feasibility

- **Outcome:** (foundation) The AI provider, budget and text-processing terms have been agreed, and the accepted local-reading and AI recipe-recognition flow has been verified.
- **Change ID:** validate-pdf-processing
- **PRD refs:** FR-002, FR-003, US-01; Non-Functional Requirements — import performance and text privacy
- **Unlocks:** S-02; question Q4; completeness check for 50 known recipes and measurement of real processing.
- **Prerequisites:** —
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:**
  - Q4: Which AI provider/model, spending limit, and text-use and retention terms should we choose? The local reading → backend → AI direction has been accepted. — Owner: user. Block: yes.
  - Does preserving columns, variants and page numbers produce correct recipes, and does the complete flow meet the PRD requirements? — Owner: team. Block: no; verification of this is required to complete F-01.
- **Risk:** Reading text and having all fields present do not prove AI extraction accuracy; the bounded F-01 check precedes account, persistence and UI integration in S-02.
- **Status:** blocked

## Slices

### S-01: Access a private collection

- **Outcome:** The user can use the existing registration and login, enter their own empty collection and see the no-recipes state; another user's collection remains inaccessible.
- **Change ID:** private-recipe-collection
- **PRD refs:** FR-001, FR-006, US-02; Access Control
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Existing authentication does not yet isolate future recipes; this capability establishes a private entry point, and subsequent capabilities extend protection to their own operations.
- **Status:** ready

Q3 resolved on 2026-09-23: an unauthenticated user opening a protected screen is redirected to login. The decision was recorded in PRD v2.

### S-02: Import complete recipes from a PDF

- **Outcome:** The user can select a local PDF, follow reading, AI analysis and saving of complete recipes, or see an error with no results saved after complete extraction failure and retry by selecting the file again. The original PDF stays on the device.
- **Change ID:** import-complete-recipes
- **PRD refs:** FR-001, FR-002, FR-003, FR-004, US-01; Non-Functional Requirements — import, privacy and temporary-data release
- **Prerequisites:** F-01, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Repeated processing must not create duplicates or partial writes; correct completion includes confirmed persistence and release of application-held temporary data without deleting the user's original file.
- **Status:** proposed

The accepted S-02 flow: local text reading with layout and page numbers → backend sends text to AI → backend code validates and saves. The AI key stays server-side; the model does not determine data ownership. The user keeps the tab open until completion. The four summer dishes must preserve three labelled ingredient variants on each card and shared instructions. Automatic saving requires all fields specified in the PRD, exactly one category, and the filename and page number. Detected incomplete results stay outside the collection and are marked as requiring a decision; S-03 completes their handling. The message does not guarantee that every recipe was found. Verification covers the known 50-recipe document, input limits, complete failure, retry, user isolation and the required processing time. S-02 alone does not complete US-01.

### S-03: Decide on incomplete recipes

- **Outcome:** The user sees missing elements in detected incomplete recipes and can keep or discard each during import; saved results and pending decisions are counted separately.
- **Change ID:** resolve-incomplete-recipes
- **PRD refs:** FR-005, FR-003, US-01; Business Logic
- **Prerequisites:** S-02
- **Parallel with:** S-04, S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** An incomplete result must not enter the collection before an explicit keep decision; a mixed import result must be presented with a warning.
- **Status:** proposed

Decisions do not require retaining the source PDF. Keeping an incomplete recipe does not add editing during import or returning to pending decisions in a later session. Missing source metadata is explicitly marked, not invented. S-02 and S-03 together fulfill US-01.

### S-04: Browse and read owned recipes

- **Outcome:** The user can browse their own saved recipes and open their titles, ingredients, instructions and available source metadata: PDF filename and page number.
- **Change ID:** browse-and-read-recipes
- **PRD refs:** FR-001, FR-006, FR-007, US-02; Non-Functional Requirements — privacy and responsiveness
- **Prerequisites:** S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Every read must enforce ownership, including direct recipe access; hiding other users' entries from a list is insufficient.
- **Status:** proposed

The view preserves separately labelled ingredient variants and shared instructions, without mixing quantities or adding a calorie calculator. It also supports kept incomplete recipes from S-03, marking missing fields. Reading works on mobile and desktop; the app does not provide a PDF library.

### S-05: Find a meal by category and ingredient

- **Outcome:** After import, the user can find a meal by category, one ingredient or both together and open a matching recipe to cook from.
- **Change ID:** find-meal-from-pdf
- **PRD refs:** FR-006, FR-007, US-02; Non-Functional Requirements — filtering and responsiveness
- **Prerequisites:** S-03, S-04
- **Parallel with:** S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Matching Polish inflected ingredient names must not broaden results to substitutions or related products.
- **Status:** proposed

US-02 verification goes from registration/login through local PDF selection, text reading, AI analysis and saving to filtering and opening a recipe. “Pomidor” matches “pomidory”, “pomidora” and “pomidorów” regardless of capitalization, but not “passata” or “ketchup”. Both filters apply together. Check the PRD response-time limit on a collection of 1000 recipes and the main flow in Chrome and Firefox on mobile and desktop, as specified in shape-notes.

### S-06: Correct a saved recipe

- **Outcome:** The user can correct the title, ingredients and instructions of their own saved recipe, including one kept despite incompleteness, and read the saved corrections.
- **Change ID:** edit-saved-recipe
- **PRD refs:** FR-008, US-03; Access Control
- **Prerequisites:** S-04
- **Parallel with:** S-03, S-05, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Ingredient changes must be reflected in filtering results after integration with S-05; editing must not allow category changes or modifications to another user's data.
- **Status:** proposed

Controlled data is sufficient to test incomplete content; after S-03 is complete, also verify the actual keep flow and subsequent editing. Editing during import remains out of scope.

### S-07: Delete a saved recipe

- **Outcome:** The user can delete their own saved recipe; it disappears from the collection, read access and filtering results.
- **Change ID:** delete-saved-recipe
- **PRD refs:** FR-009, US-04; Access Control
- **Prerequisites:** S-04
- **Parallel with:** S-03, S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Deletion must be persistent and restricted to the owner; verification also covers attempts to delete another user's recipe.
- **Status:** proposed

This deletes an already saved recipe, independently of discarding a result in S-03. After integration with S-05, verify that the deleted entry is absent from filtering results.

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
| --- | --- | --- | --- | --- |
| F-01 | validate-pdf-processing | Verify real import feasibility | no | Resolve Q4 first. |
| S-01 | private-recipe-collection | Access a private collection | yes | Q3 resolved; `private-recipe-collection` can be planned. |
| S-02 | import-complete-recipes | Import complete recipes from a PDF | no | After completing: F-01, S-01. |
| S-03 | resolve-incomplete-recipes | Decide on incomplete recipes | no | After completing: S-02. |
| S-04 | browse-and-read-recipes | Browse and read owned recipes | no | After completing: S-02. |
| S-05 | find-meal-from-pdf | Find a meal by category and ingredient | no | After completing: S-03, S-04. |
| S-06 | edit-saved-recipe | Correct a saved recipe | no | After completing: S-04. |
| S-07 | delete-saved-recipe | Delete a saved recipe | no | After completing: S-04. |

`blocked` means the item has an unresolved question that blocks planning; `proposed` means it is waiting for prerequisites. S-01 is `ready` after Q3 was resolved. Resolving Q4 alone does not complete F-01; feasibility still needs verification.

Main sequence: F-01 and S-01 → S-02 → S-03 and S-04 → S-05 → S-06 and S-07. S-06 and S-07 can be planned after S-04, but completing S-05 takes priority for a solo contributor. Parallelism means no product dependency, not a guarantee of conflict-free code changes. Shared behavior must be verified after integration. A separate Streams table is unnecessary: the work converges into one user flow.

## Open Roadmap Questions

Q1–Q2 are copied verbatim from the PRD; Q4 corresponds to the new question 3 in PRD v3; Q3 is retained as a resolved decision to preserve identifiers. The estimate mentioned in Q2 comes from the source and is not a roadmap schedule.

1. Should a later iteration allow editing incomplete recipes directly during import? — Owner: user; tentative future idea, not committed scope.
   - **Q1 — impact:** outside this milestone; does not block any item.
2. Does the revised three-week estimate provide enough time for the full MVP after adding basic saved-recipe editing and deletion? — Owner: user; validate during implementation planning. Consequence: implementation planning may still require a smaller delivery slice if the estimate proves too tight.
   - **Q2 — impact:** review scope during planning; it does not alter accepted FRs or block starting on its own. Reducing scope requires an explicit PRD change.
3. **Q3 — resolved 2026-09-23:** an unauthenticated user opening a protected screen is redirected to login. — Owner: user. Block: none.
   - **Q3 — impact:** decision recorded in PRD v2; S-01 is ready for planning.
4. **Which AI provider/model, spending limit, and text-use and retention terms should we choose?** — Owner: user. Block: F-01; indirectly S-02–S-07.
   - **Q4 — partially resolved 2026-09-23:** local PDF reading, sending text with layout/page context through the backend to AI, and backend validation and saving have been accepted. Provider, cost and processing-term choices remain open in PRD v3. This does not require choosing a paid PDF-parsing server; free operation of the entire feature remains unverified.

**Next move:** plan S-01 (`private-recipe-collection`); resolve Q4 in parallel to unblock F-01. The local reading → backend → AI architecture is accepted. The 20 MB / 100-page limit remains in effect; the proposed 150-page limit has not yet been accepted.

## Parked

- **Ebook library and PDF storage** — Outside the PRD scope; files remain temporary extraction input only.
- **Scanned PDFs** — Outside the PRD scope; the first version supports selectable text.
- **Approval of complete recipes** — Outside the PRD scope; complete results save automatically.
- **Editing during import** — Outside the PRD scope and covered by Q1; editing after saving will be available.
- **Manual and automatic meal planning** — Outside the PRD scope; the goal is choosing today's meal.
- **Calories, nutrition and dietary filters** — Outside the PRD scope; category and ingredient filtering remain.
- **Title search and manual category changes** — Outside the PRD scope; keeps the first version smaller.
- **Sharing and public collections** — Outside the PRD scope; recipes are private.

## Milestone History

## Done

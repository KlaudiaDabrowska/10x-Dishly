---
date: 2026-10-14T16:55:11+02:00
researcher: Codex
git_commit: 828ca0bc20b2fafffbb073954b939013471fe45e
branch: feature/resolve-incomplete-recipes
repository: 10xdevs-resolve-incomplete-recipes
topic: "S-03 data contract, migration, and keep/discard flow for incomplete recipes"
tags: [research, pdf-import, incomplete-recipes, supabase, keep-discard]
status: complete
last_updated: 2026-10-14
last_updated_by: Codex
---

# Research: S-03 data contract, migration, and keep/discard flow

**Date**: 2026-10-14T16:55:11+02:00
**Researcher**: Codex
**Git Commit**: 828ca0bc20b2fafffbb073954b939013471fe45e
**Branch**: feature/resolve-incomplete-recipes
**Repository**: 10xdevs-resolve-incomplete-recipes

## Research Question

What data contract, forward migration, and end-to-end flow does S-03 need so an owner can keep or discard each detected incomplete recipe during the current import, without weakening the existing ownership, digest, deduplication, or rollout guarantees?

## Summary

The current product import already identifies incomplete candidates and shows their missing elements, but it has no decision mutation. In the inspected flow, the browser retains the full candidate payload in memory, while the database retains its status, source anchor, and digest. Finalization saves complete candidates, records the remaining distinct source identities as pending, and marks the import `committed` before the user can decide ([service.ts:163-209](../../../src/lib/pdf-processing/service.ts#L163), [migration:159-180](../../../supabase/migrations/20261008120000_pdf_processing.sql#L159), [migration:1276-1286](../../../supabase/migrations/20261008120000_pdf_processing.sql#L1276)).

S-03 therefore needs a durable, owner-scoped decision contract in addition to UI controls. The direction best aligned with the inspected S-02 contract is to preserve the first finalization and add a product-only, idempotent resolve operation: one canonical pending item per reconciled source identity, a `keep` request carrying the exact in-memory payload for digest verification, and a `discard` request carrying no recipe content. Decision metadata can be durable without storing unsaved recipe content; this preserves the accepted current-session behavior ([roadmap.md:140-152](../../foundation/roadmap.md#L140), [S-02 plan:91-113](../../archive/2026-10-09-import-complete-recipes/plan.md#L91)). This is an architectural inference from the current contracts, not an approved plan.

The current `recipes` table cannot store a genuinely incomplete kept recipe because title and category are non-null and ingredient/instruction arrays must be nonempty; it also has no completeness or missing-reasons field ([migration:186-205](../../../supabase/migrations/20261008120000_pdf_processing.sql#L186)). A new additive migration after `20261009120000_product_pdf_import.sql` must define the kept-incomplete representation while preserving owner-only reads, privileged writes, immutable identity, and the existing dedupe key.

Three contract decisions remain for planning or user confirmation: whether a candidate missing category may be kept despite the exactly-one-category rule; whether the roadmap's missing-source-metadata wording describes a display case or requires changing the currently mandatory provenance contract; and how an all-discard outcome is represented so it is not mistaken for “no recipes.”

## Detailed Findings

### Accepted S-03 behavior

- S-03 requires the user to see missing elements and decide `keep` or `discard` for each detected incomplete recipe; an incomplete result must not enter the collection before an explicit keep decision ([roadmap.md:140-152](../../foundation/roadmap.md#L140)).
- The accepted current-import scope excludes editing during import and does not require returning to pending decisions later. A kept recipe is corrected after saving through the later saved-recipe editing capability ([prd.md:42-64](../../foundation/prd.md#L42), [prd.md:125-126](../../foundation/prd.md#L125)).
- Discard during import is distinct from deletion of an already saved recipe ([prd.md:107](../../foundation/prd.md#L107), [prd.md:135-140](../../foundation/prd.md#L135)).
- The five-minute processing requirement excludes human keep/discard time under the accepted representative-import condition ([prd.md:142-149](../../foundation/prd.md#L142)).

### Candidate and validation contract

- Candidate contract version 2 can represent a nullable title/category, empty ingredient groups/instructions, source anchors/pages, and typed omission reasons ([contracts.ts:1-29](../../../src/lib/pdf-processing/contracts.ts#L1), [contracts.ts:74-102](../../../src/lib/pdf-processing/contracts.ts#L74)).
- In the inspected validator, missing title, ingredients, instructions, or category makes an otherwise valid candidate incomplete. Optional missing servings or footnotes do not do so ([validation.ts:213-260](../../../src/lib/pdf-processing/validation.ts#L213)).
- Provenance is stricter than ordinary content: a candidate with no valid source pages or no supplied core-page `sourceStart` is invalid rather than keepable ([validation.ts:141-158](../../../src/lib/pdf-processing/validation.ts#L141)). Once provenance passes, the validator drops a model-provided `missing-source-metadata` reason as contradictory ([validation.ts:220-239](../../../src/lib/pdf-processing/validation.ts#L220)). The server supplies the filename from the import record during persistence ([migration:1252-1261](../../../supabase/migrations/20261008120000_pdf_processing.sql#L1252)).

### Current persistence and lifecycle

- `pdf_batch_candidates` stores the raw batch identity, source anchor, `complete | incomplete` status, and payload digest. It does not store the candidate content or omission reasons ([migration:159-169](../../../supabase/migrations/20261008120000_pdf_processing.sql#L159)).
- The service records that metadata before returning candidate content to the browser. The digest binds candidate content to owner, import, batch, schema, and contract version ([service.ts:163-209](../../../src/lib/pdf-processing/service.ts#L163), [validation.ts:276-301](../../../src/lib/pdf-processing/validation.ts#L276)).
- Finalization requires the exact recorded candidate set, recomputes each digest, reconciles overlapping results, and constructs persisted recipes from reconciled `complete` entries ([service.ts:212-300](../../../src/lib/pdf-processing/service.ts#L212)). The database independently rejects a recipe unless it maps to a recorded complete candidate with the same digest and source anchor ([migration:1215-1247](../../../supabase/migrations/20261008120000_pdf_processing.sql#L1215)).
- Under the current RPC, finalization writes a snapshot outcome with `saved`, `existing`, and `pending`, then changes the import to `committed`. A later finalize or cancel replays that outcome rather than changing decisions ([migration:1131-1160](../../../supabase/migrations/20261008120000_pdf_processing.sql#L1131), [migration:1276-1286](../../../supabase/migrations/20261008120000_pdf_processing.sql#L1276), [service.ts:212-218](../../../src/lib/pdf-processing/service.ts#L212)).
- The current `recipes` row requires title, category, nonempty ingredient groups, nonempty instructions, and nonempty source pages. It has no persisted completeness status or typed missing reasons ([migration:186-205](../../../supabase/migrations/20261008120000_pdf_processing.sql#L186)).

### Current client and API flow

- The client performs local read, create, batch processing, and finalize; its in-memory candidate array is sent to finalize and retained for the result view ([client-import.ts:158-226](../../../src/lib/pdf-processing/client-import.ts#L158)). After finalize, it derives `pending` by filtering raw returned candidates whose status is not complete ([client-import.ts:388-397](../../../src/lib/pdf-processing/client-import.ts#L388)).
- The product UI displays missing explanations and candidate content but has no keep/discard controls; it explicitly labels those cards as not saved ([RecipeImportPanel.tsx:90-143](../../../src/components/pdf-processing/RecipeImportPanel.tsx#L90)).
- The inspected product API exposes create, batch, finalize, status, and cancel. Mutations pass through authenticated user lookup, same-origin validation, UUID validation, bounded JSON parsing, and a server-created privileged service whose owner ID comes from the session ([pdf-import-api.ts:6-91](../../../src/lib/pdf-import-api.ts#L6), [pdf-validation.ts:158-195](../../../src/lib/pdf-validation.ts#L158)).
- Database-only operations remain available for an already started import when creation is disabled or the provider credential is unavailable; a resolve operation should follow that inspected status/cancel/finalize availability rule ([pdf-import-access.ts:27-35](../../../src/lib/pdf-import-access.ts#L27)).

### Canonical decision identity

- Reconciliation groups candidates by source start, merges pages, downgrades a merged item when an occurrence is incomplete, and removes candidates with conflicting content ([reconcile.ts:23-74](../../../src/lib/pdf-processing/reconcile.ts#L23)).
- The database computes pending over distinct `(source_start_page, source_start_item)` values, while the current UI lists raw `(batchIndex, candidateIndex)` results ([migration:1276-1278](../../../supabase/migrations/20261008120000_pdf_processing.sql#L1276), [client-import.ts:388-397](../../../src/lib/pdf-processing/client-import.ts#L388)). Under overlapping batches, those sets can differ: duplicate candidates can produce multiple cards for one pending source identity, and a reconciliation conflict can produce a pending count without a raw incomplete card.
- A decision contract should consequently identify one canonical reconciled source identity and retain enough recorded digest linkage to prove the exact accepted payload. Using a raw batch candidate alone would not match the existing pending semantics.

### Ownership, idempotency, and deduplication

- Browser roles have SELECT-only access to owner-matching recipe rows; table mutations and existing import RPCs are revoked from browser roles and executed through the backend service role ([migration:214-243](../../../supabase/migrations/20261008120000_pdf_processing.sql#L214), [migration:1325-1358](../../../supabase/migrations/20261008120000_pdf_processing.sql#L1325)). A keep operation should preserve privileged backend-only writes rather than grant browser INSERT.
- Recipe identity is unique on `(owner_id, file_fingerprint, source_start_page, source_start_item)`, and the current finalizer does not overwrite an existing row. This preserves possible owner edits during a renamed-file reimport ([migration:204-205](../../../supabase/migrations/20261008120000_pdf_processing.sql#L204), [migration:1251-1273](../../../supabase/migrations/20261008120000_pdf_processing.sql#L1251)).
- Existing finalize/cancel operations serialize by locking the import row ([migration:1131-1159](../../../supabase/migrations/20261008120000_pdf_processing.sql#L1131), [migration:1191-1203](../../../supabase/migrations/20261008120000_pdf_processing.sql#L1191)). A decision transaction needs equivalent serialization: replay of the same decision returns its stored result; concurrent opposite decisions must conflict rather than use last-write-wins behavior.
- A keep transaction must verify owner, product channel, canonical source identity, recorded digest, and submitted payload; insert or find the deduplicated recipe without overwriting it; record the decision; and update outcome counts atomically. A discard transaction needs the same identity/ownership checks but no recipe insert. These are planning implications derived from the inspected guarantees.

### Outcome semantics and later consumers

- The current outcome has saved, already-saved, and pending counts plus saved/existing IDs; there is no discarded count or per-item resolution state ([persistence.ts:20-33](../../../src/lib/pdf-processing/persistence.ts#L20), [migration:171-180](../../../supabase/migrations/20261008120000_pdf_processing.sql#L171)).
- Product completion currently maps committed `0 saved / 0 existing / 0 pending` to the empty/no-recipes path ([client-import.ts:229-241](../../../src/lib/pdf-processing/client-import.ts#L229)). That shape can also result from intentionally discarding all pending candidates unless the S-03 outcome distinguishes decisions.
- The dashboard accepts a committed outcome only when read-back is confirmed, pending is zero, and the saved/existing total is positive ([dashboard-import.ts:39-53](../../../src/lib/pdf-processing/dashboard-import.ts#L39)). Planning must define the post-decision destination for discard-all separately from a successful keep or an extraction that found no recipes.
- S-04 is expected to display kept incomplete recipes and mark missing fields ([roadmap.md:154-166](../../foundation/roadmap.md#L154)). The saved recipe contract therefore needs durable missing reasons, not merely a transient import-card warning.

### Migration and rollout

- The inspected repository contains two PDF migrations: the consolidated `20261008120000_pdf_processing.sql` and the later product-channel `20261009120000_product_pdf_import.sql` ([migration header:1-13](../../../supabase/migrations/20261008120000_pdf_processing.sql#L1), [product migration:1-25](../../../supabase/migrations/20261009120000_product_pdf_import.sql#L1)). S-03 should add a forward migration rather than edit either applied migration.
- Existing recipe rows were created through the complete-only finalizer in the inspected schema. A new non-null completeness field can therefore default existing rows to complete, while a missing-reasons field can default to an empty value; exact types and checks belong to planning.
- S-02's recorded rollout applies the migration before code, starts with creation disabled, and preserves existing import completion/cancellation and saved data on rollback ([contract-surfaces.md:5-7](../../../docs/reference/contract-surfaces.md#L5)). An S-03 migration must remain readable by the currently deployed code during that migration-first window and must not strand already committed imports with pending decisions.

## Architecture Insights

The strongest existing boundary is “untrusted candidate content in the browser, trusted digest/status metadata in the database, privileged owner-bound mutation in backend RPCs.” S-03 can extend that boundary without introducing a pending-content store: return a canonical reconciled decision item, keep its content in the current tab, and persist only its decision metadata until an explicit keep inserts a recipe.

A likely additive shape is a service-role-only decision table keyed by import plus canonical source identity, with a constrained `pending | kept | discarded` state, recorded digest linkage, optional recipe ID, and resolution timestamp. The exact schema is a planning decision, but one durable row per canonical pending identity closes replay, lost-response, and opposite-decision races while keeping unsaved content out of storage.

The recipe row needs two distinct concepts: current stored content (which may contain null/empty fields after keep) and the detected omissions that explain why the user had to decide. Planning must decide whether later edits recompute current completeness, preserve import-time reasons as provenance, or store both notions.

## Historical Context (from prior changes)

- Supported: S-02 intentionally excluded keep/discard and left incomplete results unsaved on the current result screen ([S-02 plan:22-27](../../archive/2026-10-09-import-complete-recipes/plan.md#L22), [S-02 plan:107-126](../../archive/2026-10-09-import-complete-recipes/plan.md#L107)).
- Supported for the historical S-02 revision: its implementation review reports 118 PDF tests and 23 database tests passing on 2026-10-12, including incomplete results remaining unsaved. Those counts are historical evidence and were not rerun in this research ([impl-review.md:22-30](../../archive/2026-10-09-import-complete-recipes/reviews/impl-review.md#L22)).
- Supported: the earlier F-01 plan required unsaved incomplete content to remain temporary and explicitly left the S-03 workflow outside that implementation ([F-01 plan:427-441](../../archive/2026-09-28-validate-pdf-processing/plan.md#L427)).
- Supported: S-08 permits parallel S-03 work provided shared-component edits do not conflict; S-03 must use the current semantic-token and shared-component contract when UI planning begins ([roadmap.md:118-138](../../foundation/roadmap.md#L118)).

## Existing Verification Surface and Gaps

No tests, Supabase processes, smoke checks, PDF database tests, or port-bound processes were run during this research.

- Existing unit coverage exercises required/optional omission classification, malformed or contradictory reasons, and provenance validation ([pdf-processing.test.mjs:539-577](../../../scripts/pdf-processing.test.mjs#L539), [pdf-processing.test.mjs:683-778](../../../scripts/pdf-processing.test.mjs#L683)).
- Existing database coverage exercises complete-only finalization, pending counts, tampering, cross-owner rejection, replay, finalize/cancel serialization, and source-identity deduplication ([pdf-processing-db.test.mjs:571-632](../../../scripts/pdf-processing-db.test.mjs#L571), [pdf-processing-db.test.mjs:798-881](../../../scripts/pdf-processing-db.test.mjs#L798)).
- Existing client coverage exercises normal finalize, lost-response recovery, cancellation before batch dispatch, and pending/empty/unconfirmed completion classification ([client-import.test.mjs:87-166](../../../scripts/client-import.test.mjs#L87), [client-import.test.mjs:194-201](../../../scripts/client-import.test.mjs#L194)).
- The inspected tests do not yet cover a decision mutation. Planning should add keep, discard, same-decision replay, opposite concurrent decisions, double click, lost response, cross-owner/cross-import payload, product-channel restriction, tampered payload, duplicate cross-batch candidates, reconciliation conflict, existing edited recipe, discard-all, and operation availability after creation is disabled.

## Code References

- `src/lib/pdf-processing/contracts.ts:1-29,74-102` — incomplete-capable candidate and omission contract.
- `src/lib/pdf-processing/validation.ts:141-158,213-260,276-301` — provenance, completeness derivation, and bound digest.
- `src/lib/pdf-processing/reconcile.ts:23-74` — source-identity reconciliation and conflict behavior.
- `src/lib/pdf-processing/service.ts:163-300` — record-before-return and complete-only finalization.
- `src/lib/pdf-processing/persistence.ts:20-33,74-105` — current outcome and owner-bound RPC adapter.
- `src/lib/pdf-processing/client-import.ts:158-241,388-397` — in-memory candidates, finalize, and completion classification.
- `src/components/pdf-processing/RecipeImportPanel.tsx:90-143` — display-only incomplete cards.
- `src/lib/pdf-import-api.ts:6-91` — current API operation surface.
- `src/lib/pdf-validation.ts:158-215` — request guard and owner-scoped read-back.
- `supabase/migrations/20261008120000_pdf_processing.sql:159-243,1131-1286` — candidate metadata, recipes, RLS, cancellation, and finalization.
- `supabase/migrations/20261009120000_product_pdf_import.sql:1-25,125-189` — immutable product/evaluation channel and owner/channel status read.

## Related Research

- `context/archive/2026-10-09-import-complete-recipes/plan.md` — S-02 product import boundary reused by S-03.
- `context/archive/2026-10-12-unify-dashboard-design-system/research.md` — current design-system and shared-component constraints for the later UI plan.

## Open Questions

1. May an owner keep a candidate whose category is missing? Allowing it preserves “do not invent missing data,” but conflicts with the PRD's exactly-one-category rule and with the exclusion of manual category changes ([prd.md:153-159](../../foundation/prd.md#L153)).
2. Should `missing-source-metadata` remain structurally impossible for a keepable candidate because source identity is mandatory, or should S-03 distinguish mandatory internal provenance from optional display metadata? Relaxing the current source anchor would affect digest identity and deduplication.
3. Should outcomes persist an explicit discarded count and per-decision states? Without decision-aware semantics, discard-all is indistinguishable from the current no-recipes result.
4. When a later complete import hits the source identity of a previously kept incomplete recipe, should the existing no-overwrite rule preserve the row and its edits, or may the system upgrade completeness without replacing mutable content?
5. Is the resolve API intentionally product-only, leaving the F-01 evaluation channel display-only, or should evaluators be able to exercise the same decisions through their separate route?
6. After a kept recipe is corrected in S-06, should the stored incomplete marker describe import-time provenance, current content completeness, or both?

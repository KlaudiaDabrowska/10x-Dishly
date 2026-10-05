# Frame Brief: F-01 acceptance after six attempts without a pass

> Second framing during Phase 4, 2026-10-05. The earlier brief is preserved in
> [frame-2026-10-03.md](frame-2026-10-03.md). Read-only investigation of saved runs;
> no provider calls, code changes or golden changes were made for this brief.

## Reported Observation

Six bounded paid attempts (runs 46fd1556, f8d03470, 403bc33a, 8b771929, cdf946c5, plus the
retired dietetyka excerpt f78525c2) produced no pass under exact golden equality. USD 1.0073475
of USD 5 has been spent. Each prompt or normalization repair removed the class of
differences it targeted, while new classes appeared in the next sample.

## Initial Framing (preserved)

- **Assistant's stated cause:** representation errors (labels, paragraph boundaries, name
  forms) plus nondeterministic model output. Summer losses were attributed to validation rejection.
- **Assistant's proposed direction:** choose between a stronger model, relaxing a validation
  rule, or a different acceptance criterion.
- **Pre-dispatch narrowing (user):** the overall question is whether the current target
  (100% golden equality) is achievable at all. Product intent for F-01: the import
  is **"a good starting point for corrections"** (users can edit saved recipes, S-06).
- **Narrowing (user):** what users must NOT have to fix themselves: **a missing whole
  recipe** and **a wrong quantity / added ingredient**. Users may tolerate a wrong meal category,
  lost kcal variants and text-form differences.

## Dimension Map

1. **Acceptance criterion** — exact equality on every field may test more than F-01 must
   prove; text-form differences would block feasibility even when content is usable.
2. **Validation rules** — internally contradictory optional metadata from the model may reject
   recipes whose content is present (whole-recipe loss caused by our own gate).
3. **Model capability / determinism** — the configured model (`gpt-5.4-mini`,
   `reasoning.effort=none`) may not reliably separate variants or keep ingredients
   within their recipe. ← initial framing
4. **Source/fixture difficulty** — summer's three side-by-side kcal columns may exceed what
   text+geometry input conveys, independent of the model.

## Hypothesis Investigation

| Hypothesis | Evidence (local artifacts under `evaluation/.../local/extraction-review/`) | Verdict |
| --- | --- | --- |
| 1. Criterion measures beyond F-01's need | Classified differences per run: most failures are form or structure. Lunchboxy 8b771929: 14 diffs, all label/paragraph/name form. Pasta 403bc33a: 54 quantity/unit plus 9 category diffs. Earlier analysis found that these come from a household-measure representation, not wrong numbers. PRD lines 36/59 ask for recipes "extracted and saved correctly" against "a verified reference set"; lines 47/156 explicitly accept that users correct content later. Field-exact equality is a plan-level choice (plan.md Phase 4 §2, frame-2026-10-03), not a PRD wording. | STRONG |
| 2. Validation discards present recipes | cdf946c5 summer: 3 of 5 rejections are `reason-conflicts-with-present-field` (the model listed `absent-footnotes` while returning 3–5 notes). Same in 403bc33a (1). An in-memory what-if that drops only the contradictory optional reason raises retained summer recipes from 0 → 3 (cdf946c5) and 2 → 3 (403bc33a). The remaining missing recipe is a context-only anchor plus an unlabelled second group. | STRONG for recipe loss caused by our own gate |
| 3. Model limits | Summer kcal variants: in every summer run every candidate has one group (or three unlabelled groups in f8d03470). Spatial lines already expose the three kcal headers at distinct x positions (reader page 7: 86/264/442) and three ingredient columns. Lunchboxy with an identical request: 14 then 28 diffs. In cdf946c5 an ingredient ("2g oleju") was added from another recipe's area, and a continuation line was split, shifting quantities across entries. These are the two classes the user rejects. | STRONG for variants and nondeterminism; MEDIUM for added/shifted ingredients (one occurrence) |
| 4. Fixture too hard | The same reader output contains all variant labels and items (frame-2026-10-03). Lunchboxy, the simplest layout, still varied between runs. | WEAK as the primary cause |

## Narrowing Signals

- The user's tolerance set excludes most of the observed diffs (form, labels, paragraphs,
  names, category, kcal variants). It keeps exactly two failure classes: **missing recipe** and
  **wrong/added quantity or ingredient**.
- Under that lens: lunchboxy 8b771929 has zero product-relevant errors. Lunchboxy cdf946c5
  has one added ingredient and shifted quantities in one recipe. Summer loses recipes in every run, mostly
  through our validator. Pasta 403bc33a: the quantity/unit diffs are representation of
  household measures that sourceText keeps verbatim. Whether that counts as a "wrong quantity" must be
  decided per field contract, not inferred.

## Cross-System Convention

The repository already separates structural validity, completeness and source accuracy
(`plan.md` Phase 4 overview; `research.md`). The PRD pairs "correct extraction" with
user correction after saving and with "detection is not guaranteed". Products of this kind
judge extraction accuracy on content (recipe found, ingredients and amounts), not on the
verbatim form of every derived field. This convention matches hypothesis 1. Exactness matters
where the product promises it: no lost recipe and no wrong amount.

## Verification: repeatability on a fixed configuration (2026-10-05)

The user requested measurement before planning. Three further lunchboxy runs used the same
code, prompt and model (eaa6c74b, 5ea356b0, ba2d31c8), scored by the read-only proposed blocking tier
(`.cache/frame-blocking-tier.mjs`: all recipes retained complete, nothing invented, identical
ingredient entries, exact metric amounts):

| Run | Exact golden | Blocking tier | Blocking failures |
| --- | --- | --- | --- |
| 8b771929 | FAIL (14) | **PASS** | — |
| cdf946c5 | FAIL (28) | FAIL | "2g oleju" added from another recipe area; humus/tofu continuation lines split |
| eaa6c74b | FAIL (9) | FAIL | 3 recipes marked incomplete by a spurious `missing-source-metadata`; "2 ząbki" unit null |
| 5ea356b0 | FAIL (8) | FAIL | 2 recipes lost: `absent-footnotes` contradicted by a returned note (validator rejects) |
| ba2d31c8 | FAIL (32) | FAIL | the same added ingredient and split continuation lines as cdf946c5 |

Blocking-tier pass rate: **1/5**. Cost USD 0.1425, cumulative F-01 USD 1.14985125, held 0.
Every blocking failure falls into one of three groups:

- **Our own metadata gates (2/5 runs):** the model's optional or omission metadata contradicts itself
  or is spurious, and the validator then drops or quarantines recipes whose content is present.
- **Ingredient membership and line joining (2/5 runs, the same two defects both times):** an
  ingredient from a neighbouring page or area is added; wrapped continuation lines become separate ingredients.
- **Amount representation (1 field):** a count-with-word unit ("2 ząbki") whose unit is dropped.

The reframe holds: the exact gate fails 5/5 mostly on form. The product-relevant failures are
real but narrow and recurrent, not random. That makes them measurable and specifiable targets.

## Reframed Problem Statement

> **The actual problem to plan around is**: F-01's acceptance gate tests verbatim
> field equality, while the product needs recipes that are never lost and never carry
> wrong or foreign ingredients/amounts. The pipeline currently loses whole recipes
> through its own contradiction rule and has shown, but not yet quantified, foreign/shifted
> ingredient errors.

Measured against the product-relevant contract, the evidence changes. Lunchboxy already
passed once, and most summer losses come from a self-inflicted validation rule. The only open
capability question is whether ingredient membership and amounts stay correct
across repeated runs. Model or prompt changes should not be chosen until the gate measures
what the product needs.

## Confidence

**HIGH** after verification. Hypotheses 1 and 2 have strong saved-artifact and repeat-run evidence,
and the user gave an explicit product signal. Five lunchboxy samples measure the product-relevant failure classes;
they recur in identifiable forms (metadata contradictions, neighbouring-area ingredient,
split continuation lines). Summer was not repeated: its variant question is a product decision,
not a measurement gap.

## What Changes for /10x-plan

Phase 4 acceptance should be re-specified as a two-tier contract. The **blocking** tier
covers: every golden recipe present and retained, no invented recipe, an exact ingredient set per
recipe/group, and exact metric quantity/unit wherever the golden has one. The **reported, non-blocking** tier
covers form fields (labels, names, sourceText form, instruction boundaries, notes, category, variants).
Determinism must be measured with repeated runs, not a single sample. The summer variant requirement
(roadmap S-02 "three labelled variants") conflicts with this tolerance and must be explicitly re-decided.
Self-contradictory optional absence reasons should no longer delete recipes. Provider/model
change stays a separate, later decision driven by the blocking-tier result.

## References

- `context/foundation/prd.md:36`, `:47`, `:59`, `:156`; `context/foundation/roadmap.md:113`
- `src/lib/pdf-processing/validation.ts:213–221` (contradiction rule), `scripts/pdf-evaluate.mjs`
- `evaluation.md` sections of 2026-10-03/05; local runs listed above
- Read-only scripts: `.cache/frame-classify.mjs`, `.cache/frame-summer-whatif.mjs`

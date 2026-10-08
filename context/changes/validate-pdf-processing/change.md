---
change_id: validate-pdf-processing
title: Validate pdf processing
status: implementing
created: 2026-09-28
updated: 2026-10-08
archived_at: null
---

Input-cap amendment (2026-10-03): raised to 98,304 at the user's request. Summer now passes input admission in two calls (60,886/80,950 tokens); golden quality remains failed. Current cost and run evidence are in evaluation.md.

Latest continuation (2026-10-03): source-derived visual line hints and clarified extraction conventions pass 63 offline tests. Run 403bc33a-7139-4f78-b9a2-8bb8ce56a3c4 still fails exact golden for both fixtures: summer retains 2 complete recipes; pasta retains all 5 titles, but only 3 candidates are structurally complete and field errors remain. Total ledger spend USD 0.75889125, held USD 0. Progress 4.4/4.9 remain pending; see the final section of [evaluation.md](evaluation.md).

Acceptance-fixture amendment (2026-10-05): pasta/low-gi replaced by lunchboxy (pages 1–12 of the Lunchboxy ebook, user-approved golden). Run 8b771929 finds all 5 recipes with correct quantities/units, but fails exact golden on 14 fields (heading as group label, split paragraph, normalized names). Spend USD 0.81810525, held 0. 4.4/4.9 pending.

Normalization amendment (2026-10-05): deterministic source-derived normalization passes offline (lunchboxy saved run 14 → 0 differences, goldens invariant). Live run cdf946c5 fails: summer 0/4 (5 invalid, mainly contradictory absent-footnotes and unlabelled variants), lunchboxy 5/5 retained but 28 differences (nondeterministic model errors). Spend USD 1.0073475, held 0. 4.4/4.9 pending; next step is a framing decision, not another retry.

Second frame (2026-10-05): [frame.md](frame.md) reframes acceptance toward product-relevant correctness (no lost recipe, no wrong/added ingredient or amount); the earlier brief is preserved as frame-2026-10-03.md. Three repeat lunchboxy runs: blocking tier 1/5 overall, with recurring failure classes. Spend USD 1.14985125, held 0. Next: /10x-plan amendment.

Acceptance measurement (2026-10-05): 4.10–4.12 done offline. Live 3×(summer+lunchboxy) with reasoning low: summer 1/3 (2 runs aborted by provider HTTP 429 rate limit, the completed run passes), lunchboxy 2/3 (recurring line-join defect). Gate 4.13 FAIL. Spent USD 1.5774885, held USD 0.294912 (two 429 calls). Awaiting user decision.

Re-measurement (2026-10-06): 4.15 done (429 handling, line merge; 275115b). Live 3×: lunchboxy 3/3 exact match, summer 1/3 (variant merge, "sos:" sub-list group, dropped household text). Spent USD 2.18933325, held 0. Awaiting user decision on summer.

Reasoning medium (2026-10-06): 4.17 done (332aa84); F-01 budget raised to USD 6 (55fa6df). Live 4.18: summer 0/3 ("sos:" emitted as an entry; one provider timeout), lunchboxy 2/3 (unmapped category → incomplete). A read-only what-if with two form rules passes all completed runs. Spent USD 2.90127825, held USD 0.147456. Awaiting decision.

4.19 done (9033455). 4.20: run 10798fa8 passes summer and lunchboxy; runs 2–3 refused by the budget preflight (short USD 0.268 against phase 6 headroom). Spent USD 3.1714035, held USD 0.147456. Awaiting a budget/headroom decision.

4.20 PASS (2026-10-06): F-01 budget USD 7 (3d72e8d). Three runs on one frozen config (medium, 120 s) pass the blocking tier — summer 3/3, lunchboxy 3/3. Spent USD 4.03048275, held USD 0.147456. Pending: manual 4.4/4.14, and documentation of the summer variant change in PRD/roadmap/fixtures.

Phase 4 complete (2026-10-06): user approved the reported-tier differences (4.4, 4.14); superseded gates 4.9/4.13/4.16/4.18 checked with a note. Next: Phase 5.

Phase 5 complete (2026-10-06, b46b966): recipes table, digest-checked atomic finalization, restricted evaluator screen and APIs. Local screen check: lunchboxy 5/5 saved, re-import deduplicated, scan rejected, cancel saved nothing. Spent USD 4.2286575, held USD 0.147456. Production deploy now requires four new secrets. Next: Phase 6.

Phase 6 offline part (2026-10-06, 2bd26b9): pdf:report, panel run record, one-time f01 ledger carry-over to production, manual-tests.md. 6.2 done; 6.1 and manual 6.3–6.5 wait for deployment and the user's 8-cell matrix (summer + lunchboxy).

Phase 6 complete (2026-10-08): first-iteration matrix (desktop Chrome) passes on the deployed stack. summer 105.4 s, lunchboxy 56.6 s; rejections cost zero. F-01 verdict GO, scoped to desktop Chrome. Firefox/phone are deferred, and Workers Free CPU (9–73 ms) is an accepted risk. Spent USD 4.51609425, held USD 0.147456. 9 migrations consolidated into one.

## Notes

F-01 in context/foundation/roadmap.md. Provider, budget and retention accepted on 2026-09-28. Research requested before implementation planning.

OpenAI API / gpt-5.4-mini replaces the original Gemini decision by explicit user approval on 2026-09-30. See [provider-decision.md](provider-decision.md). Ledger-backed synthetic generation passed; ebook accuracy remains unproven.

Phase 4 repair plan updated on 2026-10-03 from [frame-2026-10-03.md](frame-2026-10-03.md): both summer and pasta, golden as the sole accuracy criterion, initial diagnosis limited to the three existing extraction runs. Offline repairs 4.5–4.8 now pass. The subsequent authorized bounded attempt failed (summer input-token limit; pasta content/ownership differences), so 4.4 and 4.9 remain pending. See [evaluation.md](evaluation.md) for immutable run evidence and preserved spending history.

Diagnostic-fixture amendment (2026-10-04): the user authorized one bounded, separately golden-reviewed excerpt from the 54-page Dietetyka w pigułce ebook. It replaces further paid diagnostic attempts on low-gi/pasta only; it does not alter Phase 4's summer/pasta acceptance requirements, budgets or provider.

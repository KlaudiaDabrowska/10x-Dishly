# F-01 Phase 6 — final benchmark operating procedure

This is the procedure for the final F-01 measurement on the deployed Cloudflare Worker and production Supabase. The agent prepared the tools offline. The user runs every deployed and real-phone step and records actual results. Emulation, local runs and synthetic tests cannot fill any matrix cell. A blank or assumed value counts as not run.

Binding decisions for this run: the second ebook is **lunchboxy** (amendment of 2026-10-05; read "pasta" as lunchboxy). The F-01 budget is **USD 7** (amendment II of 2026-10-06). The matrix is {summer, lunchboxy} × {Chrome, Firefox} × {desktop, real phone} = **8 cells, one clean final run each**.

## 0. Ground rules

- Paid calls happen only through the deployed screen, with tested reservations, approved goldens and enough F-01 budget. Running out of budget stops new calls; it never raises a limit.
- Never delete ordinary recipes. Clean starts come from dedicated, disposable evaluator accounts (section 2).
- Output that contains source content (golden JSON, PDFs, cell records) stays under the ignored `evaluation/validate-pdf-processing/local/`. Commit only aggregate numbers.
- If any request exceeds the Workers CPU limit, the hosting gate **fails**. Record it and stop for a separate hosting decision. Do not raise CPU limits or change the plan silently.
- No retry loop. A failed cell is recorded as failed. A rerun needs a fresh clean account and fits only if the ledger still admits it.

## 1. Prerequisites (in this order)

1. **Merge and verify.** Merge the Phase 6 change to `main` after review. The gate stack must pass on that commit: `npm run lint`, `npx --no-install astro check`, `npm run test:pdf`, `npm run test:pdf:db`, `npm run test:deployment`, `npm run test:deploy-config`, `npm run build`, `npm run check:deploy -- production`. Write down the full 40-character commit SHA. This is the **evaluated commit**.
2. **Remote schema.** Inspect the production Supabase schema before applying anything (Dashboard → Database → Migrations/Tables, or `npx supabase migration list --linked` after `supabase link`). Absent repository migrations do not prove an empty database. The repository has a single consolidated migration, `20261008120000_pdf_processing.sql`. Run `npx supabase login`, `npx supabase link --project-ref <project-ref>` (the database password is entered in the terminal only), then `npx supabase db push --dry-run`. It must list exactly that one migration. Then run `npx supabase db push`. Never use a reset command or `--include-seed` against the remote project.
3. **Carry the F-01 history over (once).** The cumulative ledger (all smoke, tuning, acceptance and Phase 5 spend) exists only in the local Supabase. With the local Supabase running and its ledger untouched:

   ```sh
   export PDF_TARGET_SUPABASE_URL="https://<project-ref>.supabase.co"
   export PDF_TARGET_SUPABASE_SECRET_KEY="<production secret key; enter in the terminal, never in chat>"
   npm run pdf:carry-over-f01            # dry run: prints the planned numbers only
   npm run pdf:carry-over-f01 -- --apply # writes once; a repeat is a no-op
   ```

   Check the dry-run output. `carry` must equal the local ledger (expected spent 4,228,657,500 and held 147,456,000 nano-USD unless more local spend happened). `targetAfter.availableNanoUsd` must equal 7,000,000,000 − remote spent − remote held − carried amounts. Do not make further local paid calls after the carry-over: they would not be transferred. Evidence files are written to `evaluation/validate-pdf-processing/local/carry-over/`.

4. **Worker secrets** (Cloudflare → Workers & Pages → `dishly-web` → Settings → Variables and Secrets, or `npx wrangler secret put <NAME>`): `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `PDF_VALIDATION_EVALUATOR_IDS` (comma-separated user IDs from section 2) and `PDF_VALIDATION_ENABLED=true`. `SUPABASE_URL`, `SUPABASE_KEY` and `DEPLOY_PROBE_TOKEN` remain required as before.
5. **Deploy** the evaluated commit with the manual GitHub workflow _Deploy production_ (`workflow_dispatch`, input `commit_sha`). Record the published Worker version ID from the job summary.
6. **Budget preflight.** Run `npm run pdf:report -- budget` with the two `PDF_TARGET_*` variables set. Available F-01 capacity should be at least 16 × 147,456,000 = 2,359,296,000 nano-USD (USD 2.359296, every matrix call at its maximum reservation). After the carry-over, the expected value is about USD 2.62.
7. **Local checkout for recording.** In the repository, check out the evaluated commit with a clean tree (`git status` shows no changes under `src`, `scripts`, `supabase` or `package*.json`). Keep the approved goldens and fixture PDFs under `evaluation/validate-pdf-processing/local/`. `npm run pdf:fixtures` must pass.

## 2. Evaluator accounts

- Create **eight** dedicated, disposable accounts on the deployed app, one per cell (e.g. `f01-summer-chrome-desktop@…`). An account may be reused across fixtures, but never for the same fixture twice. One account per cell is the simplest way to guarantee a clean start.
- Get each user ID (Supabase Dashboard → Authentication → Users) and put all eight in `PDF_VALIDATION_EVALUATOR_IDS`.
- A clean start means the account has no saved recipe from that PDF. The report rejects any cell with `alreadySaved ≠ 0`. Never delete recipes to make a start clean; use a fresh account instead.

## 3. Common steps for every cell

1. Sign in with the cell's account and open `/dashboard/pdf-validation`.
2. Select the fixture PDF (summer `LETNI-DZIEN-PROBNY.pdf` or `lunchboxy-1-12.pdf`; byte-identical to the manifest). Do not interact with the page until the outcome appears. Leave the tab in the foreground, because on iOS backgrounded tabs can be suspended.
3. When the outcome appears, note: status `committed`, newly saved (summer 4, lunchboxy 5), already saved 0, not saved, the read-back sentence, and elapsed time.
4. Press **Download run record** (or **Copy run record**). The JSON contains only timings, counts, the file fingerprint and device details.
5. Check the saved recipes against the source pages: titles, ingredient amounts, at least one complete summer variant, preparation. Note any discrepancy.
6. Note whether the page stayed responsive (scrolling, Cancel button reacted), and whether anything crashed or reloaded.
7. Record the cell on the evaluation computer (environment from prerequisite 7):

   ```sh
   npm run pdf:report -- record --run-record <run-record.json> \
     --fixture summer|lunchboxy --browser chrome|firefox --device desktop|phone \
     --device-model "<e.g. iPhone 15 Pro Max>" --os "<e.g. iOS 26.0>" --browser-version "<e.g. 152.0>" \
     --network "<e.g. home Wi-Fi 300/50 Mbit>" --account <account-uuid> --commit <evaluated-sha> \
     --responsive yes|no --crashed yes|no
   ```

   This reads the persisted recipes for that import (owner-scoped, read-only), scores them against the pinned golden with the accepted blocking tier, reads tokens/cost and the F-01 snapshot, and writes a private cell file under `local/benchmark/cells/`. It prints the cell's failures, if any.

## 4. Desktop cells (agent-preparable, user-confirmed)

- Use current stable Chrome and Firefox on the desktop. Record the exact versions (`chrome://version`, `about:support`).
- Before selecting the file, open DevTools → Network with "Preserve log" and "Disable cache". Afterwards check:
  - no request body contains the PDF (only JSON to `/api/pdf-validation/imports…`; the largest is the create request with extracted text, ≤ about 2 MiB);
  - no request or response contains `OPENAI_API_KEY`, `SUPABASE_SECRET_KEY`, `sk-` or similar credentials;
  - no request goes to `api.openai.com` from the browser;
  - responses are `Cache-Control: private, no-store`.
- In Chrome the run record includes the JS heap (`performance.memory`) and long tasks. Firefox records them as `"unavailable"`. That is the correct value and is never 0.

## 5. Real-phone cells (user only)

Device: iPhone 15 Pro Max, Chrome and Firefox from the App Store, current versions (Settings → About in each app). iOS version: Settings → General → About.

1. Put the two fixture PDFs on the phone (AirDrop/Files) and check their sizes: 16,593,596 and 7,038,572 bytes.
2. Follow the common steps in the phone browser. File selection opens the Files picker. Choose "Browse" and the PDF.
3. Export the run record. **Download run record** saves it to Files → Downloads. You can also tap **Copy run record** and paste it into a note or message to yourself. Move the JSON to the evaluation computer and record the cell with `--device phone`.
4. On iOS every browser uses WebKit, so heap and long-task metrics are `"unavailable"` by design. Responsiveness is therefore your attestation (`--responsive`/`--crashed`). Note any stutter in the checklist.
5. Note the network (Wi-Fi or cellular, approximate speed).

## 6. Rejection checks (zero AI cost)

Prepare two synthetic local files (not acceptance fixtures, not committed):

```sh
cd evaluation/validate-pdf-processing/local/pdfs
pdfunite "Niski indeks glikemiczny - niska waga.pdf" lunchboxy-1-12.pdf ../over-page-limit.pdf   # 125 pages, < 20 MB
head -c 20000001 /dev/urandom > ../oversized.pdf                                                  # > 20,000,000 bytes
pdfinfo ../over-page-limit.pdf | grep Pages ; stat -c %s ../oversized.pdf
```

The 113-page low-gi ebook is within the 115-page limit since 2026-10-05, so it is not a rejection case anymore. For each file: run `npm run pdf:report -- budget` (prints the path of the snapshot), select the file on the deployed screen, download the run record, then:

```sh
npm run pdf:report -- record-rejection --run-record <run-record.json> \
  --fixture over-page-limit|oversized --commit <evaluated-sha> --budget-before <budget snapshot file>
```

Expected: error `too-many-pages` or `file-too-large`, no import ID, no batches, and an unchanged F-01 spent/held amount. In DevTools there must be no request to `/api/pdf-validation/imports`.

## 7. Cloudflare CPU and invocation outcomes

Workers observability is enabled in `wrangler.jsonc`.

- During each run, keep `npx wrangler tail dishly-web --format json` open in a terminal and save it to a local ignored file. Its events carry `outcome`, `cpuTime` and `wallTime` per invocation. It shows no request bodies; check that the log lines contain no recipe text or source text. The only application log is the content-free `pdf_validation_error` line.
- Afterwards, in Cloudflare Dashboard → Workers & Pages → `dishly-web` → Observability/Logs, filter by path `/api/pdf-validation/` and the run's time window. Record for create, every batch, finalize and status: outcome (`ok`, `exceededCpu`, `exceededMemory`, `exception`…), CPU time (ms) and wall time.
- **Pass:** every invocation has outcome `ok`. **Fail:** any `exceededCpu`/`exceededMemory`/`exception`. On Workers Free (10 ms CPU per invocation), a CPU failure fails the hosting gate. It leads to a separate hosting decision, not a silent upgrade or a `limits.cpu_ms` change.
- Record the account plan (Free or Paid) and the maximum CPU time per route in the table below.

## 8. Checklist (fill in)

| Cell                          | Account ID | Import ID | Browser + version | Device / OS | Network | Elapsed (s) | Saved / existing / not saved | Read-back | Content check | Responsive / crash | Max CPU ms (route) | Worker outcomes | Tokens in/out | Cost USD | `record` result |
| ----------------------------- | ---------- | --------- | ----------------- | ----------- | ------- | ----------- | ---------------------------- | --------- | ------------- | ------------------ | ------------------ | --------------- | ------------- | -------- | --------------- |
| summer / Chrome / desktop     |            |           |                   |             |         |             |                              |           |               |                    |                    |                 |               |          |                 |
| summer / Chrome / phone       |            |           |                   |             |         |             |                              |           |               |                    |                    |                 |               |          |                 |
| summer / Firefox / desktop    |            |           |                   |             |         |             |                              |           |               |                    |                    |                 |               |          |                 |
| summer / Firefox / phone      |            |           |                   |             |         |             |                              |           |               |                    |                    |                 |               |          |                 |
| lunchboxy / Chrome / desktop  |            |           |                   |             |         |             |                              |           |               |                    |                    |                 |               |          |                 |
| lunchboxy / Chrome / phone    |            |           |                   |             |         |             |                              |           |               |                    |                    |                 |               |          |                 |
| lunchboxy / Firefox / desktop |            |           |                   |             |         |             |                              |           |               |                    |                    |                 |               |          |                 |
| lunchboxy / Firefox / phone   |            |           |                   |             |         |             |                              |           |               |                    |                    |                 |               |          |                 |

| Rejection check                | Error code | Import created | F-01 before → after | Network: no import request |
| ------------------------------ | ---------- | -------------- | ------------------- | -------------------------- |
| over-page-limit (125 pages)    |            |                |                     |                            |
| oversized (> 20,000,000 bytes) |            |                |                     |                            |

## 9. Final report

```sh
npm run pdf:report   # with PDF_TARGET_* unset is fine: it reads only the local cell files
```

It exits 0 only when all of the following hold:

- all eight cells exist exactly once, with the same commit and configuration, recorded against the deployed project;
- each cell has the approved fixture hash, a committed import with read-back, a passing blocking tier, saved = expected golden count, existing 0, elapsed ≤ 300 s, reconciled usage and no zero memory value;
- both rejection checks pass;
- F-01 spent + held ≤ USD 7.

It prints max and mean elapsed time, matrix tokens/cost, and confirmed versus held F-01 amounts. Copy the aggregate numbers (not the cell files) into `evaluation.md`, and add the CPU/outcome and network-inspection findings from sections 4 and 7.

## 10. After the experiment

- Set `PDF_VALIDATION_ENABLED=false` (Worker secret) and redeploy if needed, or remove the evaluator IDs. Saved recipes, imports and the ledger stay. Do not drop tables or reset the F-01 counter.
- Keep the evaluator accounts and their recipes. They are evidence and are not ordinary user data.
- A failed or incomplete matrix is a no-go/pending report. It preserves findings and pending checks and does not mark F-01 done.

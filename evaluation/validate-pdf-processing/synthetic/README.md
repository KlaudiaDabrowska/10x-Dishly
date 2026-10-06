# Offline PDF reader fixtures

All content here is authored synthetic test data. No ebook content is committed.

The Node test reads the authored `layout.pdf` fixture, with three columns on
page 1, two columns and 90-degree text on page 2, a photo-only page 3, an empty
page 4 and a recipe continuation on page 5. PDF.js reads the actual bytes in the
integration test; injected engine tests cover cancellation and exact boundaries.

The local inspection entry is `reader.html`. Start it with
`npx --no-install vite --config scripts/pdf-reader.vite.config.mjs --host 127.0.0.1`,
then open `/evaluation/validate-pdf-processing/synthetic/reader.html`.
The config disables dotenv loading. PDFs selected here stay in browser memory;
the screen has no upload or model endpoint.

`window.pdfInspection.read(file, { signal })` is the product reader.
`window.pdfInspection.inspect(file, [7, 9], { signal })` is a separate, development-only
selection API for investigating the 113-page rejection fixture; it is disabled
in built artifacts and cannot feed `createTextBatches` because it is not a full
accepted document. Both APIs return `{ source, pages }`; raw transforms are PDF
coordinates and anchors use 1-based document pages and original item positions.
The visual overlay is approximate (system font, not embedded typography); JSON
positions, rotation and text are authoritative for reader evidence.

`npm run build` also creates `dist/pdf-reader-inspection` as a separate browser
verification artifact. It is outside the deployed Cloudflare client assets.
The package's exact matching module worker is emitted by Vite. The production
app does not import PDF.js yet; Phase 5 will attach the reusable reader to its
authenticated evaluator UI.

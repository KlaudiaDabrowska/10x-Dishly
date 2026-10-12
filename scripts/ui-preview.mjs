import { access, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewRoot = path.join(repositoryRoot, "tools/ui-preview");
const previewUrl = "http://127.0.0.1:4322/";
const evidenceDirectory = path.join(repositoryRoot, "context/changes/unify-dashboard-design-system/evidence/phase-1");
const mode = process.argv[2];

if (mode !== "check" && mode !== "capture") {
  throw new Error("Usage: node scripts/ui-preview.mjs <check|capture>");
}

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: repositoryRoot,
    env: options.env ?? process.env,
    stdio: options.stdio ?? "inherit",
  });
}

async function waitForExit(child, label, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${label} did not finish within ${timeoutMs}ms.`));
    }, timeoutMs);

    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with ${signal ? `signal ${signal}` : `code ${code}`}.`));
    });
  });
}

async function waitForPreview(child) {
  const deadline = Date.now() + 30_000;
  let spawnError;
  child.once("error", (error) => {
    spawnError = error;
  });

  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null)
      throw new Error(`Astro preview exited before it became ready (code ${child.exitCode}).`);

    try {
      const response = await fetch(previewUrl);
      const html = await response.text();
      if (response.ok && html.includes("data-ui-preview")) return;
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Astro preview did not answer at ${previewUrl} within 30 seconds.`);
}

async function stopPreview(child) {
  if (child.exitCode !== null) return;

  await new Promise((resolve) => {
    const forceStop = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 5_000);

    child.once("exit", () => {
      clearTimeout(forceStop);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(entryPath)));
    else files.push(entryPath);
  }

  return files;
}

async function assertPreviewIsolation() {
  const sourceFiles = await filesUnder(previewRoot);
  const bannedSourcePattern = /(?:src\/middleware|@\/lib\/(?:supabase|pdf-processing)|SUPABASE_|OPENAI_API_KEY)/;

  for (const file of sourceFiles.filter((candidate) => /\.(?:astro|css|js|mjs|ts|tsx)$/.test(candidate))) {
    const contents = await readFile(file, "utf8");
    if (bannedSourcePattern.test(contents)) {
      throw new Error(
        `Preview isolation check found a production service reference in ${path.relative(repositoryRoot, file)}.`,
      );
    }
  }

  const outputFiles = await filesUnder(path.join(previewRoot, "dist"));
  for (const file of outputFiles.filter((candidate) => /\.(?:css|html|js)$/.test(candidate))) {
    const contents = await readFile(file, "utf8");
    if (/fonts\.(?:googleapis|gstatic)\.com/.test(contents)) {
      throw new Error(
        `Built preview contains an external Google Fonts request in ${path.relative(repositoryRoot, file)}.`,
      );
    }
  }
}

async function findChrome() {
  const candidates = [process.env.CHROME_BIN, "/usr/bin/google-chrome"].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next explicit path.
    }
  }

  throw new Error("Chrome was not found. Set CHROME_BIN or install it at /usr/bin/google-chrome.");
}

async function captureScreenshots() {
  const chrome = await findChrome();
  await mkdir(evidenceDirectory, { recursive: true });

  const variants = [
    { name: "preview-light-desktop.png", theme: "light", width: 1440, height: 900 },
    { name: "preview-light-mobile.png", theme: "light", width: 390, height: 844 },
    { name: "preview-dark-desktop.png", theme: "dark", width: 1440, height: 900 },
    { name: "preview-dark-mobile.png", theme: "dark", width: 390, height: 844 },
  ];

  for (const variant of variants) {
    const output = path.join(evidenceDirectory, variant.name);
    const screenshot = run(chrome, [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${variant.width},${variant.height}`,
      `--screenshot=${output}`,
      `${previewUrl}?theme=${variant.theme}`,
    ]);
    await waitForExit(screenshot, `Chrome capture for ${variant.name}`);

    const evidence = await stat(output);
    if (!evidence.isFile() || evidence.size === 0) throw new Error(`Screenshot evidence is missing: ${output}`);
  }
}

await assertPreviewIsolation();

const astroExecutable = path.join(repositoryRoot, "node_modules/.bin/astro");
const preview = run(astroExecutable, ["preview", "--root", previewRoot, "--host", "127.0.0.1", "--port", "4322"], {
  env: { ...process.env, ASTRO_PREVIEW_BACKGROUND: "0" },
  stdio: "inherit",
});

try {
  await waitForPreview(preview);
  if (mode === "capture") await captureScreenshots();
} finally {
  await stopPreview(preview);
}

import { access, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewRoot = path.join(repositoryRoot, "tools/ui-preview");
const previewUrl = "http://127.0.0.1:4322/";
const mode = process.argv[2];
const option = (name) =>
  process.argv
    .slice(3)
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const changeId = option("change") ?? "unify-dashboard-design-system";
const captureSet = option("set") ?? "dashboard";
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(changeId)) throw new Error("Invalid --change slug.");
if (!["dashboard", "decisions", "recipes"].includes(captureSet)) throw new Error("Invalid --set value.");
if (captureSet === "recipes" && changeId !== "browse-and-read-recipes")
  throw new Error("The recipes capture profile must use --change=browse-and-read-recipes.");
const evidenceDirectory = path.join(
  repositoryRoot,
  "context/changes",
  changeId,
  captureSet === "recipes" ? "evidence" : "screenshots",
);

if (mode !== "isolation" && mode !== "check" && mode !== "capture") {
  throw new Error(
    "Usage: node scripts/ui-preview.mjs <isolation|check|capture> [--change=<change-id>] [--set=<dashboard|decisions|recipes>]",
  );
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

const sourceExtensions = [".astro", ".css", ".js", ".mjs", ".ts", ".tsx"];

async function resolveLocalImport(importer, specifier) {
  let candidate;
  if (specifier.startsWith("@/")) candidate = path.join(repositoryRoot, "src", specifier.slice(2));
  else if (specifier.startsWith(".")) candidate = path.resolve(path.dirname(importer), specifier);
  else return null;

  const candidates = path.extname(candidate)
    ? [candidate]
    : [
        ...sourceExtensions.map((extension) => candidate + extension),
        ...sourceExtensions.map((extension) => path.join(candidate, `index${extension}`)),
      ];

  for (const resolved of candidates) {
    try {
      if ((await stat(resolved)).isFile()) return resolved;
    } catch {
      // Try the next supported source extension.
    }
  }

  throw new Error(
    `Preview isolation check could not resolve ${specifier} imported by ${path.relative(repositoryRoot, importer)}.`,
  );
}

function localImportSpecifiers(contents) {
  const specifiers = [];
  const patterns = [
    /(?:import|export)(?!\s+type\b)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /@import\s+["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of contents.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

async function previewSourceGraph() {
  const previewSources = (await filesUnder(path.join(previewRoot, "src"))).filter((candidate) =>
    sourceExtensions.includes(path.extname(candidate)),
  );
  const pending = [path.join(previewRoot, "astro.config.mjs"), ...previewSources];
  const visited = new Set();

  while (pending.length > 0) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);

    const contents = await readFile(file, "utf8");
    for (const specifier of localImportSpecifiers(contents)) {
      const imported = await resolveLocalImport(file, specifier);
      if (imported && !visited.has(imported)) pending.push(imported);
    }
  }

  return [...visited];
}

async function assertPreviewSourceIsolation() {
  const sourceFiles = await previewSourceGraph();
  const bannedSourcePattern = /(?:SUPABASE_|OPENAI_API_KEY|import\.meta\.env|process\.env)/;
  const bannedPathPattern = /(?:^|\/)(?:middleware|lib\/(?:supabase|pdf-processing))(?:\.|\/)/;

  for (const file of sourceFiles) {
    const relativePath = path.relative(repositoryRoot, file).replaceAll(path.sep, "/");
    if (bannedPathPattern.test(relativePath)) {
      throw new Error(`Preview isolation check reached a production service module: ${relativePath}.`);
    }
    const contents = await readFile(file, "utf8");
    if (bannedSourcePattern.test(contents)) {
      throw new Error(`Preview isolation check found a production environment reference in ${relativePath}.`);
    }
  }

  console.log(`Preview source isolation passed for ${sourceFiles.length} reachable files.`);
}

async function assertPreviewBuildIsolation() {
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

  const dashboardVariants = [
    { name: "preview-light-desktop.png", query: "theme=light", width: 1440, height: 900 },
    { name: "preview-light-mobile.png", query: "theme=light", width: 390, height: 844 },
    { name: "preview-dark-desktop.png", query: "theme=dark", width: 1440, height: 900 },
    { name: "preview-dark-mobile.png", query: "theme=dark", width: 390, height: 844 },
    { name: "states-light-desktop.png", query: "theme=light&capture=states", width: 1440, height: 900 },
    { name: "states-light-mobile.png", query: "theme=light&capture=states", width: 390, height: 844 },
    { name: "states-dark-desktop.png", query: "theme=dark&capture=states", width: 1440, height: 900 },
    { name: "states-dark-mobile.png", query: "theme=dark&capture=states", width: 390, height: 844 },
    { name: "matrix-light-desktop.png", query: "theme=light&capture=matrix", width: 1440, height: 900 },
    { name: "matrix-light-mobile.png", query: "theme=light&capture=matrix", width: 390, height: 844 },
    { name: "matrix-dark-desktop.png", query: "theme=dark&capture=matrix", width: 1440, height: 900 },
    { name: "matrix-dark-mobile.png", query: "theme=dark&capture=matrix", width: 390, height: 844 },
  ];
  const decisionVariants = [
    {
      name: "decisions-light-desktop.png",
      query: "theme=light&view=decisions&decision=default",
      width: 1440,
      height: 900,
    },
    {
      name: "decisions-light-mobile.png",
      query: "theme=light&view=decisions&decision=default",
      width: 390,
      height: 844,
    },
    {
      name: "decisions-dark-desktop.png",
      query: "theme=dark&view=decisions&decision=default",
      width: 1440,
      height: 900,
    },
    { name: "decisions-dark-mobile.png", query: "theme=dark&view=decisions&decision=default", width: 390, height: 844 },
    {
      name: "decisions-missing-light-mobile.png",
      query: "theme=light&view=decisions&decision=missing-content",
      width: 390,
      height: 844,
    },
    {
      name: "decisions-missing-dark-mobile.png",
      query: "theme=dark&view=decisions&decision=missing-content",
      width: 390,
      height: 844,
    },
    {
      name: "decisions-discard-all-light-mobile.png",
      query: "theme=light&view=decisions&decision=discard-all",
      width: 390,
      height: 844,
    },
    {
      name: "decisions-discard-all-dark-mobile.png",
      query: "theme=dark&view=decisions&decision=discard-all",
      width: 390,
      height: 844,
    },
    {
      name: "decisions-mixed-light-mobile.png",
      query: "theme=light&view=decisions&decision=mixed",
      width: 390,
      height: 844,
    },
    {
      name: "decisions-mixed-dark-mobile.png",
      query: "theme=dark&view=decisions&decision=mixed",
      width: 390,
      height: 844,
    },
    ...["light", "dark"].flatMap((theme) =>
      ["hover", "focus", "keeping", "discarding", "kept", "discarded", "error"].map((state) => ({
        name: `decisions-${state}-${theme}-desktop.png`,
        query: `theme=${theme}&view=decisions&decision=${state}`,
        width: 1440,
        height: 900,
      })),
    ),
    {
      name: "decisions-matrix-light-desktop.png",
      query: "theme=light&view=decisions&capture=matrix",
      width: 1440,
      height: 900,
    },
    {
      name: "decisions-matrix-dark-desktop.png",
      query: "theme=dark&view=decisions&capture=matrix",
      width: 1440,
      height: 900,
    },
  ];
  const recipeVariants = [
    "empty",
    "populated",
    "hover",
    "focus",
    "pagination",
    "detail",
    "not-found",
    "error",
    "incomplete",
  ].flatMap((state) => [
    {
      name: `recipes-${state}-desktop.png`,
      query: `theme=light&view=recipes&recipe=${state}`,
      width: 1440,
      height: 900,
    },
    {
      name: `recipes-${state}-mobile.png`,
      query: `theme=light&view=recipes&recipe=${state}`,
      width: 390,
      height: 844,
    },
  ]);
  const variants =
    captureSet === "decisions" ? decisionVariants : captureSet === "recipes" ? recipeVariants : dashboardVariants;

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
      `${previewUrl}?${variant.query}`,
    ]);
    await waitForExit(screenshot, `Chrome capture for ${variant.name}`);

    const evidence = await stat(output);
    if (!evidence.isFile() || evidence.size === 0) throw new Error(`Screenshot evidence is missing: ${output}`);
  }
}

await assertPreviewSourceIsolation();

if (mode !== "isolation") {
  await assertPreviewBuildIsolation();

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
}

export async function runSmokeSteps({ steps, assertResponse, cleanup, writeLine = console.log }) {
  let failed = 0;
  try {
    for (const [name, run, expected] of steps) {
      try {
        const actual = await run();
        assertResponse(actual, expected);
        writeLine(`PASS  ${name}`);
      } catch {
        failed++;
        // Never log responses, redirect queries or exception details that could contain session secrets.
        writeLine(`FAIL  ${name} (request or assertion failed)`);
      }
    }
  } finally {
    try {
      await cleanup();
      writeLine("PASS  local smoke fixtures and accounts cleaned up");
    } catch {
      failed++;
      writeLine("FAIL  local smoke cleanup failed");
    }
  }
  writeLine(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
  return failed;
}

import { performance } from "node:perf_hooks";

export async function probeRecipeFilterPerformance({ client, filters, expectedCount, runs = 5, thresholdMs = 1_000 }) {
  async function execute() {
    const startedAt = performance.now();
    const { data, error } = await client.rpc("search_recipes", filters);
    const durationMs = performance.now() - startedAt;
    if (error) throw new Error(`Recipe filter performance probe failed: ${error.message}`);
    if (!Array.isArray(data) || data.length !== expectedCount) {
      throw new Error(
        `Recipe filter performance probe expected ${expectedCount} rows, received ${data?.length ?? "none"}`,
      );
    }
    return durationMs;
  }

  await execute();
  const samplesMs = [];
  for (let run = 0; run < runs; run += 1) samplesMs.push(await execute());

  const slowSample = samplesMs.find((durationMs) => durationMs >= thresholdMs);
  if (slowSample !== undefined) {
    throw new Error(
      `Recipe filter performance probe exceeded ${thresholdMs} ms: ${samplesMs
        .map((durationMs) => durationMs.toFixed(1))
        .join(", ")} ms`,
    );
  }

  return samplesMs;
}

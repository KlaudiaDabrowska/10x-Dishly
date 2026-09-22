import { setTimeout } from "node:timers/promises";

const base = process.env.BASE_URL ?? "http://localhost:4321";
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) {
      ready = true;
      break;
    }
  } catch {
    /* The local server may still be starting. */
  }
  await setTimeout(1000);
}
if (!ready) throw new Error(`Local server did not become ready at ${base}`);

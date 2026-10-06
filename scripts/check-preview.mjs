import assert from "node:assert/strict";
import "./wait-for-server.mjs";

const base = process.env.BASE_URL ?? "http://localhost:4321";
for (const path of [
  "/",
  "/auth/signin",
  "/auth/signup",
  "/dashboard",
  "/dashboard/pdf-validation",
  "/api/auth/signin",
  "/api/auth/signup",
  "/api/auth/signout",
  "/api/ops/deployment-probe",
  "/api/pdf-validation/imports",
]) {
  const api = path.startsWith("/api/");
  const response = await fetch(base + path, {
    method: api ? "POST" : "GET",
    headers: { Origin: base },
    redirect: "manual",
  });
  const expected = api || path.startsWith("/dashboard") ? 503 : 200;
  assert.equal(response.status, expected, path);
  if (path !== "/api/ops/deployment-probe") {
    const directives = (response.headers.get("cache-control") ?? "")
      .toLowerCase()
      .split(",")
      .map((value) => value.trim());
    assert.ok(directives.includes("private"), `${path}: private cache directive`);
    assert.ok(directives.includes("no-store"), `${path}: no-store cache directive`);
  }
  if (expected === 503)
    assert.deepEqual(await response.json(), {
      error: path.startsWith("/api/pdf-validation/") ? "experiment_unavailable" : "infrastructure_unavailable",
    });
  console.log(`PASS ${path}: ${expected}`);
}

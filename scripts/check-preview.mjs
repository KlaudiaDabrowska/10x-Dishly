import assert from "node:assert/strict";
import "./wait-for-server.mjs";

const base = process.env.BASE_URL ?? "http://localhost:4321";
for (const path of [
  "/",
  "/auth/signin",
  "/auth/signup",
  "/dashboard",
  "/api/auth/signin",
  "/api/auth/signup",
  "/api/auth/signout",
  "/api/ops/deployment-probe",
]) {
  const api = path.startsWith("/api/");
  const response = await fetch(base + path, {
    method: api ? "POST" : "GET",
    headers: { Origin: base },
    redirect: "manual",
  });
  const expected = api || path === "/dashboard" ? 503 : 200;
  assert.equal(response.status, expected, path);
  if (expected === 503) assert.deepEqual(await response.json(), { error: "infrastructure_unavailable" });
  console.log(`PASS ${path}: ${expected}`);
}

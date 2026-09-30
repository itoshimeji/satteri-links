import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { devEngines } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const manager = devEngines?.packageManager;
assert.equal(manager?.name, "pnpm", "Releases require the repository-pinned pnpm");
assert.match(manager.version, /^\d+\.\d+\.\d+$/, "Pin an exact pnpm version");

if (process.argv[2] === "--expected-version") {
  console.log(manager.version);
} else {
  // Changesets invokes pnpm directly, outside vp's internal package-manager runner.
  const actual = execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim();
  assert.equal(actual, manager.version, "Child-process pnpm differs from the repository pin");
  console.log(`Release child processes use pnpm ${actual}`);
}

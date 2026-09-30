import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const packageDirectories = ["heading-link", "link-card", "link-mention", "link-preview"];

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

export function publicPackages() {
  assert.equal(readJson(join(root, "package.json")).private, true, "Root must be private");
  assert.equal(readJson(join(root, "demo/package.json")).private, true, "Demo must be private");
  return new Map(
    packageDirectories.map((directory) => {
      const manifest = readJson(join(root, "packages", directory, "package.json"));
      assert.notEqual(manifest.private, true, `${manifest.name} must remain public`);
      return [manifest.name, { manifest, directory }];
    }),
  );
}

function exportPaths(value) {
  if (typeof value === "string") return [value];
  return Object.values(value ?? {}).flatMap(exportPaths);
}

export function validatePackedPackage(manifest, files, expectedPackages = publicPackages()) {
  const expected = expectedPackages.get(manifest.name)?.manifest;
  assert.ok(expected, `Unexpected public package: ${manifest.name}`);
  assert.notEqual(manifest.private, true, `${manifest.name} is private`);
  assert.equal(manifest.version, expected.version, `${manifest.name} version mismatch`);
  for (const field of ["exports", "types", "engines"]) {
    assert.deepEqual(manifest[field], expected[field], `${manifest.name} ${field} mismatch`);
  }
  assert.equal(manifest.publishConfig?.access, "public", "Package access must be public");
  const requiredFiles = [
    "package.json",
    "README.md",
    "LICENSE",
    "dist/index.mjs",
    "dist/index.d.mts",
    ...exportPaths(expected.exports).map((path) => path.replace(/^\.\//, "")),
    ...(expected.files?.filter((file) => file !== "dist") ?? []),
  ];
  for (const file of requiredFiles) {
    assert.ok(files.includes(`package/${file}`), `${manifest.name} is missing ${file}`);
  }
  for (const file of files) {
    assert.ok(
      /^package\/(?:dist\/(?!.*(?:\.test\.|\.spec\.|(?:^|\/)\.))[\w./-]+|package\.json|README\.md|LICENSE|CHANGELOG\.md|preset\.css|THIRD_PARTY_NOTICES\.md)$/.test(
        file,
      ) && !file.includes(".."),
      `${manifest.name} contains an unexpected file: ${file}`,
    );
  }
  for (const section of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    for (const name of Object.keys(expected[section] ?? {})) {
      assert.ok(manifest[section]?.[name], `${manifest.name} is missing ${section}.${name}`);
    }
    for (const [name, range] of Object.entries(manifest[section] ?? {})) {
      assert.ok(!/^(workspace:|catalog:|file:|link:)/.test(range), `Unresolved ${name}: ${range}`);
      if (expectedPackages.has(name)) {
        assert.equal(range, expectedPackages.get(name).manifest.version, `${name} must be exact`);
      }
    }
  }
  if (expected.peerDependencies?.satteri) {
    const version = readJson(
      join(
        root,
        "packages",
        expectedPackages.get(manifest.name).directory,
        "node_modules/satteri/package.json",
      ),
    ).version;
    assert.equal(manifest.peerDependencies.satteri, version, "Sätteri catalog was not resolved");
  }
  return `${manifest.name}@${manifest.version}`;
}

function tarballFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? tarballFiles(path) : entry.name.endsWith(".tgz") ? [path] : [];
  });
}

export function verifyDirectory(directory, { complete = false } = {}) {
  const packages = publicPackages();
  const names = new Set();
  const manifestsByTarball = new Map();
  const tarballs = tarballFiles(directory);
  for (const tarball of tarballs) {
    const files = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).trim().split("\n");
    const manifest = JSON.parse(
      execFileSync("tar", ["-xOzf", tarball, "package/package.json"], { encoding: "utf8" }),
    );
    assert.ok(!names.has(manifest.name), `Duplicate tarball: ${manifest.name}`);
    names.add(manifest.name);
    manifestsByTarball.set(tarball, manifest);
    console.log(`Verified ${validatePackedPackage(manifest, files, packages)}`);
  }
  if (complete) {
    assert.deepEqual(
      [...names].sort((a, b) => a.localeCompare(b)),
      [...packages.keys()].sort((a, b) => a.localeCompare(b)),
      "Expected all four tarballs",
    );
  } else {
    const plan = readJson(join(directory, "publish-plan.json"));
    assert.equal(plan.version, 1, "Unsupported Changesets pack format");
    const plannedNames = new Set();
    for (const release of plan.plan.flat()) {
      assert.ok(!plannedNames.has(release.name), `Duplicate planned package: ${release.name}`);
      assert.ok(packages.has(release.name), `Unexpected planned package: ${release.name}`);
      assert.equal(release.version, packages.get(release.name).manifest.version);
      assert.equal(release.kind, "publish", "Only public package publishes are allowed");
      assert.equal(release.access, "public", "Publish plan access must be public");
      assert.equal(release.tag, "latest", "Only stable latest releases are allowed");
      const tarball = resolve(directory, release.tarball.path);
      assert.ok(tarballs.includes(tarball), `Missing planned tarball: ${release.name}`);
      assert.equal(
        manifestsByTarball.get(tarball).name,
        release.name,
        "Planned tarball name mismatch",
      );
      assert.equal(
        manifestsByTarball.get(tarball).version,
        release.version,
        "Planned tarball version mismatch",
      );
      const integrity = `sha256-${createHash("sha256").update(readFileSync(tarball)).digest("base64")}`;
      assert.equal(integrity, release.tarball.integrity, `${release.name} integrity mismatch`);
      plannedNames.add(release.name);
    }
    assert.deepEqual(
      [...names].sort((a, b) => a.localeCompare(b)),
      [...plannedNames].sort((a, b) => a.localeCompare(b)),
      "Tarballs differ from publish plan",
    );
  }
}

function packAndVerify() {
  const directory = mkdtempSync(join(tmpdir(), "satteri-release-pack-"));
  try {
    for (const packageDirectory of packageDirectories) {
      execFileSync("pnpm", ["pack", "--pack-destination", directory], {
        cwd: join(root, "packages", packageDirectory),
        stdio: "inherit",
      });
    }
    verifyDirectory(directory, { complete: true });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === "--pack") packAndVerify();
  else {
    assert.ok(process.argv[2], "Pass a Changesets pack directory or --pack");
    verifyDirectory(resolve(process.argv[2]));
  }
}

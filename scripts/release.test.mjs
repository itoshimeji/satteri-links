import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  publicPackages,
  root,
  validatePackedPackage,
  verifyDirectory,
} from "./verify-release-pack.mjs";

const packages = publicPackages();

function fixture(name = "satteri-link-card") {
  const manifest = structuredClone(packages.get(name).manifest);
  if (manifest.dependencies?.["@itoshinji/link-preview"]) {
    manifest.dependencies["@itoshinji/link-preview"] =
      packages.get("@itoshinji/link-preview").manifest.version;
  }
  if (manifest.peerDependencies?.satteri) {
    manifest.peerDependencies.satteri = JSON.parse(
      readFileSync(
        join(root, "packages", packages.get(name).directory, "node_modules/satteri/package.json"),
        "utf8",
      ),
    ).version;
  }
  const files = ["package.json", "README.md", "LICENSE", "dist/index.mjs", "dist/index.d.mts"];
  files.push(...manifest.files.filter((file) => file !== "dist"));
  return { manifest, files: files.map((file) => `package/${file}`) };
}

void test("all four packages and only those packages are public", () => {
  assert.deepEqual(
    [...packages.keys()].sort((a, b) => a.localeCompare(b)),
    [
      "@itoshinji/link-preview",
      "satteri-heading-link",
      "satteri-link-card",
      "satteri-link-mention",
    ],
  );
  for (const name of packages.keys()) {
    const { manifest, files } = fixture(name);
    assert.equal(validatePackedPackage(manifest, files), `${manifest.name}@${manifest.version}`);
  }
});

void test("rejects accidental demo publishing, wrong versions, and missing exports/legal files", () => {
  const { manifest, files } = fixture();
  assert.throws(() => validatePackedPackage({ ...manifest, name: "satteri-links-demo" }, files));
  assert.throws(() => validatePackedPackage({ ...manifest, version: "9.0.0" }, files));
  for (const file of ["dist/index.mjs", "dist/index.d.mts", "LICENSE", "preset.css"]) {
    assert.throws(() =>
      validatePackedPackage(
        manifest,
        files.filter((entry) => entry !== `package/${file}`),
      ),
    );
  }
});

void test("rejects unresolved workspace/catalog ranges and stale preview dependency versions", () => {
  const { manifest, files } = fixture();
  for (const range of ["workspace:*", "catalog:", "file:../link-preview", "0.0.0"]) {
    manifest.dependencies["@itoshinji/link-preview"] = range;
    assert.throws(() => validatePackedPackage(manifest, files));
  }
});

void test("rejects missing dependencies and altered export, type, or runtime metadata", () => {
  const { manifest, files } = fixture();
  for (const field of ["dependencies", "exports", "types", "engines"]) {
    const changed = structuredClone(manifest);
    delete changed[field];
    assert.throws(() => validatePackedPackage(changed, files));
  }
});

void test("rejects source, tests, and secrets in tarballs", () => {
  const { manifest, files } = fixture();
  for (const path of ["src/index.ts", ".env", "dist/index.test.mjs", "dist/../.npmrc"]) {
    assert.throws(() => validatePackedPackage(manifest, [...files, `package/${path}`]));
  }
});

void test("publish artifacts must match their plan, manifest identities, and integrity", () => {
  const directory = mkdtempSync(join(tmpdir(), "satteri-artifact-test-"));
  try {
    const releases = ["satteri-link-card", "satteri-link-mention"].map((name) => {
      const { manifest, files } = fixture(name);
      const staging = join(directory, name);
      for (const file of files) {
        mkdirSync(join(staging, file, ".."), { recursive: true });
        writeFileSync(
          join(staging, file),
          file.endsWith("package.json") ? JSON.stringify(manifest) : "test fixture",
        );
      }
      const path = `${name}.tgz`;
      execFileSync("tar", ["-czf", join(directory, path), ...files], { cwd: staging });
      rmSync(staging, { recursive: true });
      return {
        name,
        version: manifest.version,
        kind: "publish",
        access: "public",
        tag: "latest",
        tarball: {
          path,
          integrity: `sha256-${createHash("sha256")
            .update(readFileSync(join(directory, path)))
            .digest("base64")}`,
        },
      };
    });
    const writePlan = (plan) =>
      writeFileSync(
        join(directory, "publish-plan.json"),
        JSON.stringify({ version: 1, plan: [plan] }),
      );
    writePlan(releases);
    assert.doesNotThrow(() => verifyDirectory(directory));
    writePlan(
      releases.map((release, index) => ({ ...release, tarball: releases[1 - index].tarball })),
    );
    assert.throws(() => verifyDirectory(directory), /tarball name mismatch/);
    writePlan(
      releases.map((release) => ({
        ...release,
        tarball: { ...release.tarball, integrity: "sha256-invalid" },
      })),
    );
    assert.throws(() => verifyDirectory(directory), /integrity mismatch/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

void test("independent versioning includes changelogs and skips private packages", () => {
  const config = JSON.parse(readFileSync(join(root, ".changeset/config.json"), "utf8"));
  assert.deepEqual(config.fixed, []);
  assert.deepEqual(config.linked, []);
  assert.equal(config.updateInternalDependencies, "patch");
  assert.equal(config.changelog, "@changesets/cli/changelog");
  assert.deepEqual(config.privatePackages, { version: false, tag: false });
});

void test("Changesets versions preview and its exact-dependency consumers without bumping heading or demo", () => {
  const directory = mkdtempSync(join(tmpdir(), "satteri-version-test-"));
  try {
    for (const path of [
      "package.json",
      "pnpm-workspace.yaml",
      "demo/package.json",
      ".changeset/config.json",
    ]) {
      mkdirSync(join(directory, path, ".."), { recursive: true });
      cpSync(join(root, path), join(directory, path));
    }
    for (const { directory: packageDirectory } of packages.values()) {
      const path = `packages/${packageDirectory}/package.json`;
      mkdirSync(join(directory, path, ".."), { recursive: true });
      cpSync(join(root, path), join(directory, path));
    }
    const configPath = join(directory, ".changeset/config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    // Isolate version/dependency semantics from formatter package-manager setup.
    config.format = false;
    config.changelog = join(root, "node_modules/@changesets/cli/dist/changelog.mjs");
    writeFileSync(configPath, JSON.stringify(config));
    writeFileSync(
      join(directory, ".changeset/preview-fix.md"),
      '---\n"@itoshinji/link-preview": patch\n---\n\nFix preview metadata.\n',
    );
    execFileSync("git", ["init", "-b", "main"], { cwd: directory, stdio: "pipe" });
    execFileSync("git", ["add", "."], { cwd: directory });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Release Test",
        "-c",
        "user.email=release-test@example.invalid",
        "commit",
        "-m",
        "test fixture",
      ],
      { cwd: directory, stdio: "pipe" },
    );
    execFileSync(process.execPath, [join(root, "node_modules/@changesets/cli/bin.js"), "version"], {
      cwd: directory,
      stdio: "inherit",
    });
    for (const [name, { manifest, directory: packageDirectory }] of packages) {
      const updated = JSON.parse(
        readFileSync(join(directory, "packages", packageDirectory, "package.json"), "utf8"),
      );
      const released = name !== "satteri-heading-link";
      const expectedVersion = released
        ? manifest.version.replace(/(\d+)$/, (patch) => String(Number(patch) + 1))
        : manifest.version;
      assert.equal(updated.version, expectedVersion, `${name} release version`);
      if (released) {
        const changelog = readFileSync(
          join(directory, "packages", packageDirectory, "CHANGELOG.md"),
          "utf8",
        );
        assert.ok(changelog.includes(expectedVersion), `${name} changelog version`);
      }
      if (updated.dependencies?.["@itoshinji/link-preview"]) {
        assert.equal(updated.dependencies["@itoshinji/link-preview"], "workspace:*");
      }
    }
    assert.equal(
      JSON.parse(readFileSync(join(directory, "demo/package.json"), "utf8")).version,
      "0.0.1",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

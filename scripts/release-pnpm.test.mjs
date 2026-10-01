import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { publicPackages, root } from "./verify-release-pack.mjs";

const run = promisify(execFile);
const cli = join(root, "node_modules/@changesets/cli/bin.js");
const probe = join(root, "scripts/release-pnpm.mjs");
const packages = publicPackages();

function workspace(directory) {
  for (const path of [
    "package.json",
    "pnpm-workspace.yaml",
    "demo/package.json",
    ".changeset/config.json",
  ]) {
    mkdirSync(join(directory, path, ".."), { recursive: true });
    cpSync(join(root, path), join(directory, path));
  }
  for (const { directory: name } of packages.values()) {
    mkdirSync(join(directory, "packages", name), { recursive: true });
    cpSync(
      join(root, "packages", name, "package.json"),
      join(directory, "packages", name, "package.json"),
    );
  }
}

void test("the release probe finds exactly the repository-pinned pnpm in a child process", async () => {
  const { stdout } = await run(process.execPath, [probe], { cwd: root });
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.ok(stdout.includes(`pnpm ${manifest.devEngines.packageManager.version}`));
});

void test("missing pnpm reproduces the Changesets publish-plan failure before any registry call", async () => {
  const directory = mkdtempSync(join(tmpdir(), "satteri-missing-pnpm-"));
  try {
    workspace(directory);
    const env = { ...process.env, PATH: directory };
    await assert.rejects(run(process.execPath, [probe], { cwd: directory, env }), /ENOENT/);
    await assert.rejects(
      run(process.execPath, [cli, "publish-plan"], { cwd: directory, env, timeout: 15_000 }),
      (error) => {
        assert.match(error.stdout, /spawn pnpm ENOENT/);
        return true;
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

void test("minor feature changesets create three releases and leave heading/demo alone", async () => {
  const directory = mkdtempSync(join(tmpdir(), "satteri-initial-version-"));
  try {
    workspace(directory);
    const changesetPath = join(directory, ".changeset/minor-features.md");
    // Keep this fixture valid after the real seed is consumed by the release PR.
    writeFileSync(
      changesetPath,
      [
        "---",
        ...[...packages.keys()]
          .filter((name) => name !== "satteri-heading-link")
          .map((name) => `${JSON.stringify(name)}: minor`),
        "---",
        "",
        "Add request concurrency limits.",
        "",
      ].join("\n"),
    );
    const configPath = join(directory, ".changeset/config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.changelog = join(root, "node_modules/@changesets/cli/dist/changelog.mjs");
    writeFileSync(configPath, JSON.stringify(config));
    await run("git", ["init", "-b", "main"], { cwd: directory });
    await run("git", ["add", "."], { cwd: directory });
    await run(
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
      { cwd: directory },
    );
    await run(process.execPath, [cli, "version"], { cwd: directory });
    for (const [name, { directory: packageDirectory, manifest }] of packages) {
      const updated = JSON.parse(
        readFileSync(join(directory, "packages", packageDirectory, "package.json"), "utf8"),
      );
      const [major, minor] = manifest.version.split(".");
      const released = name !== "satteri-heading-link";
      assert.equal(
        updated.version,
        released ? `${major}.${Number(minor) + 1}.0` : manifest.version,
      );
      if (released) {
        const changelog = readFileSync(
          join(directory, "packages", packageDirectory, "CHANGELOG.md"),
          "utf8",
        );
        assert.ok(changelog.includes(updated.version));
        assert.ok(changelog.includes("request concurrency limits"));
      }
    }
    assert.equal(
      JSON.parse(readFileSync(join(directory, "demo/package.json"), "utf8")).version,
      "0.0.1",
    );
    assert.throws(() => readFileSync(changesetPath), /ENOENT/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

void test("the release probe rejects a pnpm executable with the wrong version", async () => {
  const directory = mkdtempSync(join(tmpdir(), "satteri-wrong-pnpm-"));
  try {
    writeFileSync(join(directory, "pnpm"), "#!/bin/sh\necho 0.0.0\n", { mode: 0o755 });
    await assert.rejects(
      run(process.execPath, [probe], { env: { ...process.env, PATH: directory } }),
      /Child-process pnpm differs from the repository pin/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

void test("real Changesets publish-plan skips already published versions on partial and complete retries", async () => {
  const directory = mkdtempSync(join(tmpdir(), "satteri-pnpm-plan-"));
  const requests = new Set();
  const published = new Set();
  const registry = createServer((request, response) => {
    assert.equal(request.method, "GET", "The regression must never publish");
    const name = decodeURIComponent(new URL(request.url, "http://localhost").pathname)
      .slice(1)
      .replace(/@\d.*$/, "");
    assert.ok(packages.has(name), "The regression must only fetch package metadata");
    requests.add(name);
    if (published.has(name)) {
      const { manifest } = packages.get(name);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          name,
          "dist-tags": { latest: manifest.version },
          versions: {
            [manifest.version]: {
              name,
              version: manifest.version,
              // pnpm 12 ignores versions without a tarball in registry metadata.
              // Keep the URL local; publish-plan must never download it.
              dist: {
                tarball: `http://${request.headers.host}/tarballs/${encodeURIComponent(name)}-${manifest.version}.tgz`,
              },
            },
          },
        }),
      );
      return;
    }
    // An empty registry makes all four packages publish candidates. This serves
    // metadata only; publication, credentials, and the live npm registry are unused.
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
  });
  try {
    workspace(directory);
    await new Promise((resolve, reject) => {
      registry.once("error", reject);
      registry.listen(0, "127.0.0.1", resolve);
    });
    const url = `http://127.0.0.1:${registry.address().port}/`;
    writeFileSync(
      join(directory, ".npmrc"),
      `registry=${url}\n@itoshinji:registry=${url}\nfetch-retries=0\n`,
    );
    const output = join(directory, "publish-plan.json");
    await run(process.execPath, [cli, "publish-plan", "--output", output], {
      cwd: directory,
      timeout: 30_000,
    });
    assert.deepEqual(
      [...requests].sort((a, b) => a.localeCompare(b)),
      [...packages.keys()].sort((a, b) => a.localeCompare(b)),
    );
    const { plan } = JSON.parse(readFileSync(output, "utf8"));
    assert.deepEqual(
      plan
        .flat()
        .filter((entry) => entry.kind === "publish")
        .map((entry) => [entry.name, entry.version])
        .sort(([a], [b]) => a.localeCompare(b)),
      [...packages]
        .map(([name, { manifest }]) => [name, manifest.version])
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    const retryPlan = async () => {
      requests.clear();
      await run(process.execPath, [cli, "publish-plan", "--output", output], {
        cwd: directory,
        timeout: 30_000,
      });
      assert.deepEqual(
        [...requests].sort((a, b) => a.localeCompare(b)),
        [...packages.keys()].sort((a, b) => a.localeCompare(b)),
        "Every retry must check the registry for all four packages",
      );
      return JSON.parse(readFileSync(output, "utf8"))
        .plan.flat()
        .filter((entry) => entry.kind === "publish")
        .map((entry) => [entry.name, entry.version])
        .sort(([a], [b]) => a.localeCompare(b));
    };
    // Model preview successfully published before card/mention failed. Heading
    // is already published and must remain outside the recovery plan as well.
    published.add("@itoshinji/link-preview");
    published.add("satteri-heading-link");
    assert.deepEqual(
      await retryPlan(),
      ["satteri-link-card", "satteri-link-mention"].map((name) => [
        name,
        packages.get(name).manifest.version,
      ]),
    );
    published.add("satteri-link-card");
    published.add("satteri-link-mention");
    assert.deepEqual(await retryPlan(), []);
  } finally {
    registry.closeAllConnections();
    await new Promise((resolve) => registry.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});

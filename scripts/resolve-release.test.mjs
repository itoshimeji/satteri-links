import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isAncestor, repository, resolveRelease } from "./resolve-release.mjs";

// Captured from PR #6 and the actual failed production job, with source URLs.
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/release-pr-6.json", import.meta.url), "utf8"),
);
const rejection = JSON.parse(
  readFileSync(new URL("./fixtures/publish-ref-rejection.json", import.meta.url), "utf8"),
);
const releaseSha = fixture.pullRequest.merge_commit_sha;
const laterMainSha = "7".repeat(40);
const push = () => ({
  repository,
  eventName: "push",
  ref: "refs/heads/main",
  sha: releaseSha,
  event: {
    repository: { full_name: repository },
    ref: "refs/heads/main",
    after: releaseSha,
    forced: false,
    deleted: false,
  },
});
const dispatch = () => ({
  ...push(),
  eventName: "workflow_dispatch",
  sha: laterMainSha,
  event: { repository: { full_name: repository }, inputs: { release_pr: "6" } },
});

function api({
  pr = fixture.pullRequest,
  files = fixture.files,
  ancestor = true,
  matchingSources = true,
  associated = [pr],
} = {}) {
  return {
    associatedPullRequests: async () => structuredClone(associated),
    pullRequest: async (number) => {
      assert.equal(number, 6);
      return structuredClone(pr);
    },
    files: async (number) => {
      assert.equal(number, 6);
      return structuredClone(files);
    },
    isAncestor: async (sha, workflowSha) => {
      assert.equal(sha, releaseSha);
      assert.ok([releaseSha, laterMainSha].includes(workflowSha));
      return ancestor;
    },
    packageSourcesMatch: async () => matchingSources,
  };
}

void test("the actual squash-merge push resolves the authorized release commit", async () => {
  assert.deepEqual(await resolveRelease(push(), api()), { number: 6, sha: releaseSha });
});

void test("main dispatch recovers already merged #6 without selecting the newer workflow commit", async () => {
  const context = dispatch();
  const result = await resolveRelease(context, api());
  assert.deepEqual(result, { number: 6, sha: releaseSha });
  assert.notEqual(result.sha, context.sha);
});

void test("ordinary main pushes and the recovery-fix merge do not authorize publication", async () => {
  const context = push();
  context.sha = laterMainSha;
  context.event.after = laterMainSha;
  const adapter = api();
  adapter.pullRequest = async () =>
    assert.fail("An unrelated push must not reach release authorization");
  assert.equal(await resolveRelease(context, adapter), null);
  assert.equal(
    await resolveRelease(context, { ...adapter, associatedPullRequests: async () => [] }),
    null,
  );
});

void test("replays the production ref rejection even with the approved merge commit checked out", async () => {
  const context = {
    ...push(),
    eventName: rejection.eventName,
    ref: rejection.deniedRef,
    sha: rejection.checkedOutReleaseSha,
  };
  assert.ok(rejection.annotation.includes(context.ref));
  await assert.rejects(resolveRelease(context, api()), /Publication must execute on main/);
});

void test("ref/event checks reject PR triggers, non-main dispatches, and inconsistent push payloads", async () => {
  const cases = [
    { ...dispatch(), ref: "refs/heads/feature" },
    { ...dispatch(), ref: "refs/tags/v1.0.0" },
    { ...dispatch(), eventName: "pull_request" },
    { ...dispatch(), eventName: "pull_request_target" },
    { ...dispatch(), repository: "attacker/satteri-links" },
    { ...push(), event: { ...push().event, after: laterMainSha } },
    { ...push(), event: { ...push().event, ref: "refs/pull/6/merge" } },
    { ...push(), event: { ...push().event, forced: true } },
    { ...push(), event: { ...push().event, deleted: true } },
    { ...dispatch(), event: { ...dispatch().event, inputs: { release_pr: "6; publish" } } },
  ];
  for (const context of cases) await assert.rejects(resolveRelease(context, api()));
});

void test("historical release recovery rejects forks, unmerged/ordinary/bot-merged PRs, and non-main history", async () => {
  const mutations = [
    (pr) => {
      pr.head.repo.full_name = "attacker/satteri-links";
    },
    (pr) => {
      pr.merged = false;
    },
    (pr) => {
      pr.head.ref = "feature";
    },
    (pr) => {
      pr.base.ref = "development";
    },
    (pr) => {
      pr.base.repo.full_name = "attacker/satteri-links";
    },
    (pr) => {
      pr.merged_by.type = "Bot";
    },
    (pr) => {
      pr.user.login = "attacker";
      pr.user.type = "User";
    },
    (pr) => {
      pr.merge_commit_sha = "main";
    },
  ];
  for (const mutate of mutations) {
    const pr = structuredClone(fixture.pullRequest);
    mutate(pr);
    await assert.rejects(resolveRelease(dispatch(), api({ pr })));
  }
  await assert.rejects(
    resolveRelease(dispatch(), api({ ancestor: false })),
    /trusted main history/,
  );
  await assert.rejects(
    resolveRelease(dispatch(), api({ matchingSources: false })),
    /package inputs must match/,
  );
});

void test("a release PR cannot smuggle workflow/source/config changes through the publication path", async () => {
  for (const filename of [
    ".github/workflows/publish.yml",
    "packages/link-card/src/plugin.ts",
    ".changeset/config.json",
    ".changeset/README.md",
    "package.json",
  ]) {
    await assert.rejects(
      resolveRelease(
        dispatch(),
        api({ files: [...fixture.files, { filename, status: "modified" }] }),
      ),
      /Unexpected release file/,
    );
  }
  await assert.rejects(
    resolveRelease(
      dispatch(),
      api({ files: [{ filename: "packages/link-card/CHANGELOG.md", status: "added" }] }),
    ),
    /package version updates/,
  );
});

void test("ancestry uses Git commit history, not a trusted-looking branch name or API label", () => {
  const directory = mkdtempSync(join(tmpdir(), "satteri-release-ancestry-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: "pipe" }).trim();
  try {
    git("init", "-b", "main");
    mkdirSync(join(directory, "packages"));
    mkdirSync(join(directory, "scripts"));
    mkdirSync(join(directory, ".changeset"));
    mkdirSync(join(directory, ".github/actions/setup-release-pnpm"), { recursive: true });
    writeFileSync(join(directory, "packages/source"), "approved package source");
    for (const path of [
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "vite.config.ts",
      "tsconfig.base.json",
      "LICENSE",
      ".changeset/config.json",
      ".github/actions/setup-release-pnpm/action.yml",
      "scripts/verify-release-pack.mjs",
      "scripts/release-pnpm.mjs",
    ])
      writeFileSync(join(directory, path), "unchanged input");
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({
        devDependencies: { "vite-plus": "0.2.7" },
        devEngines: { packageManager: { name: "pnpm", version: "11.18.0" } },
        engines: { node: ">=22" },
        scripts: { prepare: "vp config", "release:pack": "node scripts/verify-release-pack.mjs" },
      }),
    );
    writeFileSync(join(directory, "version"), "release");
    git("add", ".");
    git(
      "-c",
      "user.name=Release Test",
      "-c",
      "user.email=release-test@example.invalid",
      "commit",
      "-m",
      "release",
    );
    const release = git("rev-parse", "HEAD");
    writeFileSync(join(directory, "version"), "workflow fix");
    git("add", ".");
    git(
      "-c",
      "user.name=Release Test",
      "-c",
      "user.email=release-test@example.invalid",
      "commit",
      "-m",
      "workflow fix",
    );
    const main = git("rev-parse", "HEAD");
    // Run the real exported Git check in a separate process at the fixture root.
    const module = new URL("./resolve-release.mjs", import.meta.url).href;
    const check = (ancestor, descendant) =>
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import {isAncestor} from ${JSON.stringify(module)}; process.stdout.write(String(isAncestor(${JSON.stringify(ancestor)},${JSON.stringify(descendant)})));`,
        ],
        { cwd: directory, encoding: "utf8" },
      );
    assert.equal(check(release, main), "true");
    assert.equal(check(main, release), "false");
    assert.throws(() => isAncestor("main", release));
    const sourceCheck = (workflowSha) =>
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import {packageSourcesMatch} from ${JSON.stringify(module)}; process.stdout.write(String(packageSourcesMatch(${JSON.stringify(release)},${JSON.stringify(workflowSha)})));`,
        ],
        { cwd: directory, encoding: "utf8" },
      );
    assert.equal(
      sourceCheck(main),
      "true",
      "Infrastructure-only recovery preserves provenance package inputs",
    );
    const commitFixture = (message) => {
      git("add", ".");
      git(
        "-c",
        "user.name=Release Test",
        "-c",
        "user.email=release-test@example.invalid",
        "commit",
        "-m",
        message,
      );
      return git("rev-parse", "HEAD");
    };
    writeFileSync(join(directory, "scripts/verify-release-pack.mjs"), "changed pack executable");
    assert.equal(sourceCheck(commitFixture("change pack tooling")), "false");
    git("reset", "--hard", main);
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
    manifest.scripts.prepare = "node scripts/other-prepare.mjs";
    writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
    assert.equal(sourceCheck(commitFixture("change prepare command")), "false");
    git("reset", "--hard", main);
    writeFileSync(join(directory, "scripts/new-build.mjs"), "new executable");
    assert.equal(sourceCheck(commitFixture("add executable")), "false");
    git("reset", "--hard", main);
    writeFileSync(join(directory, "scripts/resolve-release.mjs"), "trusted main resolver");
    writeFileSync(join(directory, "scripts/resolve-release.test.mjs"), "new regression test");
    manifest.scripts.prepare = "vp config";
    manifest.scripts["release:check"] = "node --test scripts/resolve-release.test.mjs";
    writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
    assert.equal(sourceCheck(commitFixture("add trusted resolver and regression tests")), "true");
    writeFileSync(join(directory, "packages/source"), "new unreleased package source");
    git("add", ".");
    git(
      "-c",
      "user.name=Release Test",
      "-c",
      "user.email=release-test@example.invalid",
      "commit",
      "-m",
      "later feature",
    );
    assert.equal(
      sourceCheck(git("rev-parse", "HEAD")),
      "false",
      "A later package change cannot be attested as the older release",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

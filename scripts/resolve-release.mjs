import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const repository = "itoshimeji/satteri-links";
const shaPattern = /^[a-f0-9]{40}$/;
const packagePattern =
  /^packages\/(heading-link|link-card|link-mention|link-preview)\/(package\.json|CHANGELOG\.md)$/;

export function validateContext(context) {
  assert.equal(context.repository, repository, "Publication is limited to the trusted repository");
  // Checkout does not change GITHUB_REF, the environment's deployment rule,
  // or the ref/workflow identity in OIDC claims. Check the actual run context.
  assert.equal(context.ref, "refs/heads/main", "Publication must execute on main");
  assert.match(context.sha, shaPattern, "The trusted workflow revision must be immutable");
  assert.equal(context.event.repository?.full_name, repository, "Event repository mismatch");
  if (context.eventName === "push") {
    assert.equal(context.event.ref, context.ref, "Push ref mismatch");
    assert.equal(context.event.after, context.sha, "Push commit mismatch");
    assert.ok(
      !context.event.deleted && !context.event.forced,
      "Do not publish from deleted/forced pushes",
    );
  } else {
    assert.equal(context.eventName, "workflow_dispatch", "Unsupported publication event");
    assert.match(
      context.event.inputs?.release_pr ?? "",
      /^[1-9]\d*$/,
      "Specify a merged release PR number",
    );
    assert.ok(
      Number.isSafeInteger(Number(context.event.inputs.release_pr)),
      "Invalid release PR number",
    );
  }
}

export function validateRelease(pr, files) {
  assert.equal(pr.state, "closed", "Release PR must be closed");
  assert.equal(pr.merged, true, "Release PR must be merged");
  assert.equal(pr.merged_by?.type, "User", "A human merge is the publication decision");
  assert.equal(
    pr.user?.login,
    "github-actions[bot]",
    "Only generated Changesets release PRs can publish",
  );
  assert.equal(pr.user?.type, "Bot", "Expected the GitHub Actions bot");
  assert.equal(pr.base?.ref, "main", "Release PR must target main");
  assert.equal(pr.base?.repo?.full_name, repository, "Release base repository mismatch");
  assert.equal(pr.head?.repo?.full_name, repository, "Fork release PRs cannot publish");
  assert.equal(pr.head?.ref, "changeset-release/main", "Unexpected release source branch");
  assert.match(pr.merge_commit_sha, shaPattern, "Release merge commit must be immutable");
  assert.ok(
    files.some((file) => file.filename.endsWith("/package.json")),
    "Expected package version updates",
  );
  for (const file of files) {
    const consumedChangeset =
      /^\.changeset\/(?!README\.md$)[\w-]+\.md$/.test(file.filename) && file.status === "removed";
    const versionOrChangelog =
      packagePattern.test(file.filename) && ["added", "modified"].includes(file.status);
    const lockfileUpdate = file.filename === "pnpm-lock.yaml" && file.status === "modified";
    assert.ok(
      consumedChangeset || versionOrChangelog || lockfileUpdate,
      `Unexpected release file: ${file.filename}`,
    );
  }
  return pr.merge_commit_sha;
}

export async function resolveRelease(context, api) {
  validateContext(context);
  let number;
  if (context.eventName === "push") {
    const associated = await api.associatedPullRequests(context.sha);
    const candidates = associated.filter(
      (pr) =>
        pr.merge_commit_sha === context.sha &&
        pr.head?.ref === "changeset-release/main" &&
        pr.head?.repo?.full_name === repository &&
        pr.base?.ref === "main",
    );
    if (candidates.length === 0) return null; // Ordinary main pushes do not publish.
    assert.equal(candidates.length, 1, "Ambiguous release merge");
    number = candidates[0].number;
  } else {
    number = Number(context.event.inputs.release_pr);
  }
  const pr = await api.pullRequest(number);
  assert.equal(pr.number, number, "Release PR identity mismatch");
  const sha = validateRelease(pr, await api.files(number));
  if (context.eventName === "push")
    assert.equal(sha, context.sha, "Automatic publication must match this push's merge commit");
  assert.ok(
    await api.isAncestor(sha, context.sha),
    "Release commit must be in the trusted main history",
  );
  if (sha !== context.sha)
    assert.ok(
      await api.packageSourcesMatch(sha, context.sha),
      "Recovery package inputs must match the main workflow revision used in provenance",
    );
  return { number, sha };
}

export function packageSourcesMatch(releaseSha, workflowSha) {
  assert.match(releaseSha, shaPattern);
  assert.match(workflowSha, shaPattern);
  const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: "pipe" }).trim();
  // pnpm provenance records GITHUB_SHA (the workflow revision), not checkout
  // HEAD. An infrastructure-only recovery must retain identical package inputs.
  for (const path of [
    "packages",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "vite.config.ts",
    "tsconfig.base.json",
    "LICENSE",
    ".changeset/config.json",
    ".github/actions/setup-release-pnpm/action.yml",
  ]) {
    if (git("rev-parse", `${releaseSha}:${path}`) !== git("rev-parse", `${workflowSha}:${path}`))
      return false;
  }
  const buildConfig = (sha) => {
    const { devDependencies, devEngines, engines, scripts } = JSON.parse(
      git("show", `${sha}:package.json`),
    );
    // release:check only runs regression tests. It may gain tests in a workflow
    // repair, but all executable build/pack/install commands must stay identical.
    const { "release:check": _releaseCheck, ...executableScripts } = scripts ?? {};
    return { devDependencies, devEngines, engines, scripts: executableScripts };
  };
  if (JSON.stringify(buildConfig(releaseSha)) !== JSON.stringify(buildConfig(workflowSha)))
    return false;
  const executableFiles = (sha) =>
    git("ls-tree", "-r", "--name-only", sha, "scripts")
      .split("\n")
      .filter(
        (path) =>
          path &&
          !path.endsWith(".test.mjs") &&
          !path.startsWith("scripts/fixtures/") &&
          path !== "scripts/resolve-release.mjs",
      );
  // The resolver comes from trusted main and tests never generate the package.
  // Compare every other script, including newly added executable files.
  const releaseFiles = executableFiles(releaseSha);
  const workflowFiles = executableFiles(workflowSha);
  if (JSON.stringify(releaseFiles) !== JSON.stringify(workflowFiles)) return false;
  return releaseFiles.every(
    (path) =>
      git("rev-parse", `${releaseSha}:${path}`) === git("rev-parse", `${workflowSha}:${path}`),
  );
}

export function isAncestor(ancestor, descendant) {
  assert.match(ancestor, shaPattern);
  assert.match(descendant, shaPattern);
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { stdio: "pipe" });
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
}

async function main() {
  const context = {
    repository: process.env.GITHUB_REPOSITORY,
    ref: process.env.GITHUB_REF,
    sha: process.env.GITHUB_SHA,
    eventName: process.env.GITHUB_EVENT_NAME,
    event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")),
  };
  validateContext(context);
  assert.ok(process.env.GITHUB_TOKEN, "A read-only GitHub token is required");
  const get = async (path) => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15_000),
    });
    assert.ok(response.ok, `GitHub metadata request failed (${response.status})`);
    return response.json();
  };
  const pages = async (path) => {
    const entries = [];
    for (let page = 1; ; page++) {
      const batch = await get(`${path}?per_page=100&page=${page}`);
      entries.push(...batch);
      if (batch.length < 100) return entries;
    }
  };
  const release = await resolveRelease(context, {
    associatedPullRequests: (sha) => pages(`commits/${sha}/pulls`),
    pullRequest: (number) => get(`pulls/${number}`),
    files: (number) => pages(`pulls/${number}/files`),
    isAncestor,
    packageSourcesMatch,
  });
  console.log(
    `Publication event ${context.eventName}; deployment ref ${context.ref}; trusted workflow ${context.sha}`,
  );
  if (release)
    console.log(
      `Authorized release PR #${release.number}; immutable package source ${release.sha}`,
    );
  else console.log("This main push is not a merged release PR; no publication.");
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `release-sha=${release?.sha ?? ""}\nrelease-pr=${release?.number ?? ""}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();

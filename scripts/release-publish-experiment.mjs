import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const artifactSource = process.argv[2];
assert.ok(artifactSource, "Pass the verified original publish artifact directory");
const candidate = process.env.PATH.split(process.platform === "win32" ? ";" : ":")
  .map((path) => join(path, "pnpm"))
  .find((path) => {
    try {
      accessSync(path, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
assert.ok(candidate, "pnpm must be set up before the diagnostic");
const entry = realpathSync(candidate);
function booleanValue(value) {
  return value == null || value.trim() === "undefined"
    ? "unset"
    : /^(true|false)$/.test(value.trim())
      ? value.trim()
      : "non-boolean (redacted)";
}
function configValue(key) {
  try {
    const value = execFileSync(entry, ["config", "get", key], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15000,
    }).trim();
    return key === "registry" ? new URL(value).origin : booleanValue(value);
  } catch {
    return "query failed (output redacted)";
  }
}
const actualConfig = {
  dryRun: configValue("dryRun"),
  registryOrigin: configValue("registry"),
  provenance: configValue("provenance"),
};
console.log(
  JSON.stringify({
    kind: "allowlisted setup diagnostic",
    node: process.version,
    pnpmExecutable: entry,
    pnpmExecutableSha256: createHash("sha256").update(readFileSync(entry)).digest("hex"),
    config: actualConfig,
    env: {
      PNPM_CONFIG_DRY_RUN: booleanValue(process.env.PNPM_CONFIG_DRY_RUN),
      pnpm_config_dry_run: booleanValue(process.env.pnpm_config_dry_run),
      PNPM_CONFIG_PROVENANCE: booleanValue(process.env.PNPM_CONFIG_PROVENANCE),
    },
  }),
);
const cli = join(repo, "node_modules/@changesets/cli/bin.js");
const directory = mkdtempSync(join(tmpdir(), "satteri-publish-reproduction-"));
const workspace = join(directory, "workspace");
const artifact = join(directory, "artifact");
const bin = join(directory, "bin");
for (const path of [workspace, bin]) mkdirSync(path, { recursive: true });
cpSync(artifactSource, artifact, { recursive: true });
for (const path of [
  "package.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  ".changeset/config.json",
  "demo/package.json",
]) {
  mkdirSync(join(workspace, path, ".."), { recursive: true });
  cpSync(join(repo, path), join(workspace, path));
}
for (const name of ["link-preview", "link-card", "link-mention", "heading-link"]) {
  mkdirSync(join(workspace, "packages", name), { recursive: true });
  cpSync(
    join(repo, "packages", name, "package.json"),
    join(workspace, "packages", name, "package.json"),
  );
}
symlinkSync(join(repo, "node_modules"), join(workspace, "node_modules"), "dir");
const trace = join(directory, "subprocess.jsonl");
const guard = join(directory, "localhost-only.cjs");
writeFileSync(
  guard,
  `const net=require('node:net');const tls=require('node:tls');const dns=require('node:dns');
function check(host){if(host && !['127.0.0.1','localhost','::1'].includes(host))throw new Error('Blocked non-local network: '+host);}
const connect=net.Socket.prototype.connect; net.Socket.prototype.connect=function(...a){let v=a[0]; if(Array.isArray(v))v=v[0];if(v && typeof v==='object')check(v.host);else if(typeof v==='number')check(a[1]);return connect.apply(this,a);};
const t=tls.connect;tls.connect=function(...a){const v=a[0];check(typeof v==='object'?v.host:a[1]);return t.apply(this,a);};
const d=dns.lookup;dns.lookup=function(host,...a){check(host);return d.call(this,host,...a);};
`,
);
writeFileSync(
  join(bin, "pnpm"),
  `#!${process.execPath}
const fs=require('node:fs');const cp=require('node:child_process');const args=process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(trace)},JSON.stringify({argv:args,cwd:process.cwd(),nativeEntry:${JSON.stringify(entry)},env:Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(CI|PNPM_CONFIG_DRY_RUN|pnpm_config_dry_run|PNPM_CONFIG_PROVENANCE|pnpm_config_provenance|NODE_OPTIONS|PNPM_CONFIG_REGISTRY|NPM_CONFIG_REGISTRY|PNPM_CONFIG_USERCONFIG)$/.test(k)))})+String.fromCharCode(10));
const child=cp.spawn(${JSON.stringify(entry)},args,{stdio:'inherit',env:process.env});child.on('exit',(code,signal)=>{if(signal)process.kill(process.pid,signal);else process.exit(code??1);});
`,
  { mode: 0o755 },
);
const requests = [];
let putMode = "success";
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  let data;
  try {
    data = JSON.parse(body.toString());
  } catch {}
  requests.push({
    method: req.method,
    url: req.url,
    bodyLength: body.length,
    package: data?.name,
    versions: Object.keys(data?.versions ?? {}),
    authPresent: Boolean(req.headers.authorization),
  });
  if (req.method === "PUT") {
    assert.equal(req.headers.authorization, "Bearer local-fixture-only");
    if (putMode === "reject") {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Fixture deliberately rejected publish" }));
    } else {
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, id: data?.name, rev: "fixture" }));
    }
  } else {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const registry = `http://127.0.0.1:${server.address().port}/`;
const config = join(directory, "isolated.npmrc");
writeFileSync(
  config,
  `registry=${registry}\n@itoshinji:registry=${registry}\n//127.0.0.1:${server.address().port}/:_authToken=local-fixture-only\nfetch-retries=0\n`,
);
writeFileSync(join(directory, "empty-global.npmrc"), "");
writeFileSync(join(workspace, ".npmrc"), readFileSync(config));
// No authentication/OIDC environment is copied into the fake publication process.
const env = {
  PATH: `${bin}:${process.env.PATH}`,
  CI: "true",
  NODE_OPTIONS: `--require=${guard}`,
  PNPM_CONFIG_USERCONFIG: config,
  PNPM_CONFIG_GLOBALCONFIG: join(directory, "empty-global.npmrc"),
  PNPM_CONFIG_REGISTRY: registry,
  PNPM_CONFIG_PROVENANCE: "false",
  ...Object.fromEntries(
    ["PNPM_CONFIG_DRY_RUN", "pnpm_config_dry_run"]
      .filter((key) => /^(true|false)$/.test(process.env[key] ?? ""))
      .map((key) => [key, process.env[key]]),
  ),
};
async function run(label, command, args, cwd = workspace, extraEnv = {}) {
  const start = requests.length;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = [],
      err = [];
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => err.push(c));
    child.on("error", reject);
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Timed out: " + label));
    }, 25000);
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({
        code,
        signal,
        stdout: Buffer.concat(out).toString(),
        stderr: Buffer.concat(err).toString(),
      });
    });
  });
  const record = {
    label,
    command,
    args,
    cwd,
    ...result,
    stdoutBytes: Buffer.byteLength(result.stdout),
    stderrBytes: Buffer.byteLength(result.stderr),
    requests: requests.slice(start),
  };
  writeFileSync(join(directory, label + ".json"), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record));
  return record;
}
try {
  const networkGuard = await run("network-guard", process.execPath, [
    "-e",
    "require('node:http').get('http://nonlocal.invalid/')",
  ]);
  assert.notEqual(networkGuard.code, 0);
  assert.ok(networkGuard.stderr.includes("Blocked non-local network"));
  assert.equal(networkGuard.requests.length, 0);
  await run("git-init", "git", ["init", "-b", "main"]);
  await run("git-add", "git", ["add", "."]);
  await run("git-commit", "git", [
    "-c",
    "user.name=Release Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    "fixture",
  ]);
  const cwd = join(workspace, "packages/link-card");
  const tarball = join(artifact, "packages/satteri-link-card-0.5.0.tgz");
  const version = await run("native-version", entry, ["--version"], cwd);
  assert.equal(version.stdout.trim(), "11.18.0");
  await run(
    "native-relative",
    entry,
    [
      "publish",
      relative(cwd, tarball),
      "--json",
      "--access",
      "public",
      "--tag",
      "latest",
      "--no-git-checks",
    ],
    cwd,
  );
  await run(
    "native-absolute",
    entry,
    ["publish", tarball, "--json", "--access", "public", "--tag", "latest", "--no-git-checks"],
    cwd,
  );
  const actual = await run("changesets-exact", process.execPath, [
    cli,
    "publish",
    "--from-pack-dir",
    artifact,
  ]);
  const enabled = { PNPM_CONFIG_DRY_RUN: "false", pnpm_config_dry_run: "false" };
  const real = await run(
    "changesets-controlled-publish",
    process.execPath,
    [cli, "publish", "--from-pack-dir", artifact],
    workspace,
    enabled,
  );
  assert.equal(real.code, 0);
  assert.equal(real.requests.filter((r) => r.method === "PUT").length, 3);
  putMode = "reject";
  const rejected = await run(
    "changesets-rejected",
    process.execPath,
    [cli, "publish", "--from-pack-dir", artifact],
    workspace,
    enabled,
  );
  assert.equal(rejected.code, 1);
  assert.equal(rejected.requests.filter((r) => r.method === "PUT").length, 1);
  putMode = "success";
  const dry = await run(
    "changesets-env-dry-run",
    process.execPath,
    [cli, "publish", "--from-pack-dir", artifact],
    workspace,
    { PNPM_CONFIG_DRY_RUN: "true", pnpm_config_dry_run: "true" },
  );
  assert.equal(dry.code, 0);
  assert.equal(dry.requests.length, 0);
  assert.ok(dry.stdout.includes("Successfully published"));
  console.log(
    JSON.stringify({
      kind: "conclusion",
      inheritedConfigurationPutCount: actual.requests.filter((r) => r.method === "PUT").length,
      controlledPublicationPutCount: 3,
      dryRunPutCount: 0,
    }),
  );
  console.log(
    JSON.stringify({
      directory,
      registry,
      trace: readFileSync(trace, "utf8"),
      artifactSha256: createHash("sha256").update(readFileSync(tarball)).digest("hex"),
    }),
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}

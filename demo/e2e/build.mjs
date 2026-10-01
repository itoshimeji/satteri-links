import { spawn } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const demoDirectory = fileURLToPath(new URL("../", import.meta.url));
const workspaceDirectory = fileURLToPath(new URL("../../", import.meta.url));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

/** @param {string[]} args @param {string} cwd */
async function run(args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(pnpm, args, {
      cwd,
      env: { ...process.env, SATTERI_E2E: "1" },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`pnpm ${args.join(" ")} failed (${signal ?? code})`));
    });
  });
}

// Never reuse a prior fixture build, Vite cache or copied public asset.
await rm(new URL("../dist-e2e/", import.meta.url), { recursive: true, force: true });
await rm(new URL("../.e2e/", import.meta.url), { recursive: true, force: true });
await mkdir(new URL("../.e2e/public/", import.meta.url), { recursive: true });
await cp(new URL("../public/", import.meta.url), new URL("../.e2e/public/", import.meta.url), {
  recursive: true,
});
await cp(
  new URL("./fixtures/e2e-assets/", import.meta.url),
  new URL("../.e2e/public/e2e-assets/", import.meta.url),
  {
    recursive: true,
  },
);

// Build only the packages exercised by the demo, including their dependencies.
// A workspace-wide build would also generate the ordinary network-backed demo.
await run(
  [
    "exec",
    "vp",
    "run",
    "--no-cache",
    "--fail-if-no-match",
    "--filter",
    "satteri-link-card...",
    "--filter",
    "satteri-link-mention...",
    "--filter",
    "satteri-heading-link...",
    "build",
  ],
  workspaceDirectory,
);
await run(["exec", "astro", "build", "--config", "astro.e2e.config.mjs"], demoDirectory);

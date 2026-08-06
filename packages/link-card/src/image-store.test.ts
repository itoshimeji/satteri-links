import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import { createFileSystemImageCacheStore } from "./image-store.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test("provides the link-card public path when only a directory is customized", async () => {
  const directory = await mkdtemp(join(tmpdir(), "satteri-link-card-store-"));
  temporaryDirectories.push(directory);
  const store = createFileSystemImageCacheStore({ directory });

  const cached = await store.put(new URL("https://example.com/image.png"), {
    bytes: Uint8Array.from([1]),
    contentType: "image/png",
  });

  expect(cached.src).toMatch(/^\/satteri-link-card\/[a-f0-9]{64}\/asset\.png$/);
});

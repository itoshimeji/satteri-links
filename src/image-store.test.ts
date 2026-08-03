import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { createFileSystemImageCacheStore } from "./image-store.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "satteri-link-card-images-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("createFileSystemImageCacheStore", () => {
  test("writes and reads an image using a URL hash and MIME extension", async () => {
    const directory = await temporaryDirectory();
    const sourceUrl = new URL("https://example.com/card");
    const store = createFileSystemImageCacheStore({
      directory,
      publicPath: "/assets/cards",
    });

    const cached = await store.put(sourceUrl, {
      bytes: Uint8Array.from([1, 2, 3]),
      contentType: "image/png; charset=binary",
    });

    expect(cached.src).toMatch(/^\/assets\/cards\/[a-f0-9]{64}\/asset\.png$/);
    expect(await store.get(sourceUrl)).toEqual(cached);

    const hashDirectory = (await readdir(directory))[0];
    const [filename] = await readdir(join(directory, hashDirectory));
    expect(filename).toBe("asset.png");
    expect(await readFile(join(directory, hashDirectory, filename))).toEqual(
      Buffer.from([1, 2, 3]),
    );
  });

  test("returns undefined when an image has not been cached", async () => {
    const directory = await temporaryDirectory();
    const store = createFileSystemImageCacheStore({ directory });

    expect(await store.get(new URL("https://example.com/missing"))).toBeUndefined();
  });

  test("rejects unsupported content types", async () => {
    const directory = await temporaryDirectory();
    const store = createFileSystemImageCacheStore({ directory });

    await expect(
      store.put(new URL("https://example.com/card"), {
        bytes: Uint8Array.from([1]),
        contentType: "image/svg+xml",
      }),
    ).rejects.toThrow("Unsupported image content type");
  });
});

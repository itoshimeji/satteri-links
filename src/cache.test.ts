import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { MetadataCache } from "./cache.ts";
import type { LinkMetadata } from "./types.ts";

const temporaryDirectories: string[] = [];
const metadata: LinkMetadata = {
  url: "https://example.com/article",
  title: "Example article",
};

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "satteri-link-card-cache-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) =>
        import("node:fs/promises").then(({ rm }) =>
          rm(directory, { force: true, recursive: true }),
        ),
      ),
  );
});

describe("MetadataCache", () => {
  test("writes and reads metadata using a hashed filename", async () => {
    const directory = await temporaryDirectory();
    const cache = new MetadataCache({ directory });

    await cache.set(metadata.url, metadata);

    expect(await cache.get(metadata.url)).toEqual(metadata);
    const files = await readdir(directory);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[a-f0-9]{64}\.json$/);
    const entry = JSON.parse(await readFile(join(directory, files[0]), "utf8"));
    expect(entry).toMatchObject({ metadata, url: metadata.url });
  });

  test("returns undefined for missing, corrupt, or mismatched entries", async () => {
    const directory = await temporaryDirectory();
    const cache = new MetadataCache({ directory });

    expect(await cache.get(metadata.url)).toBeUndefined();

    await cache.set(metadata.url, metadata);
    const [file] = await readdir(directory);
    await writeFile(join(directory, file), "not json", "utf8");
    expect(await cache.get(metadata.url)).toBeUndefined();

    await cache.set(metadata.url, metadata);
    const entry = JSON.parse(await readFile(join(directory, file), "utf8"));
    entry.url = "https://example.com/different";
    await writeFile(join(directory, file), JSON.stringify(entry), "utf8");
    expect(await cache.get(metadata.url)).toBeUndefined();
  });

  test("expires old entries according to maxAge", async () => {
    const directory = await temporaryDirectory();
    const cache = new MetadataCache({ directory, maxAge: 500 });
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);

    await cache.set(metadata.url, metadata);
    now.mockReturnValue(1_501);

    expect(await cache.get(metadata.url)).toBeUndefined();
  });

  test("keeps entries indefinitely when maxAge is false", async () => {
    const directory = await temporaryDirectory();
    const cache = new MetadataCache({ directory, maxAge: false });
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);

    await cache.set(metadata.url, metadata);
    now.mockReturnValue(Number.MAX_SAFE_INTEGER);

    expect(await cache.get(metadata.url)).toEqual(metadata);
  });
});

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LinkCardCacheOptions, LinkMetadata } from "./types.js";

type CacheEntry = {
  fetchedAt: number;
  metadata: LinkMetadata;
  url: string;
};

const DEFAULT_CACHE_DIRECTORY = ".cache/satteri-link-card";
const DEFAULT_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function isCacheEntry(value: unknown): value is CacheEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<CacheEntry>;
  return (
    typeof entry.url === "string" &&
    typeof entry.fetchedAt === "number" &&
    !!entry.metadata &&
    typeof entry.metadata.url === "string" &&
    typeof entry.metadata.title === "string"
  );
}

export class MetadataCache {
  readonly #directory: string;
  readonly #maxAge: number | false;

  constructor(options: LinkCardCacheOptions = {}) {
    this.#directory = options.directory ?? DEFAULT_CACHE_DIRECTORY;
    this.#maxAge = options.maxAge ?? DEFAULT_MAX_AGE;
  }

  #path(url: string): string {
    const hash = createHash("sha256").update(url).digest("hex");
    return join(this.#directory, `${hash}.json`);
  }

  async get(url: string): Promise<LinkMetadata | undefined> {
    try {
      const contents = await readFile(this.#path(url), "utf8");
      const entry: unknown = JSON.parse(contents);

      if (!isCacheEntry(entry) || entry.url !== url) {
        return undefined;
      }

      if (this.#maxAge !== false && Date.now() - entry.fetchedAt > this.#maxAge) {
        return undefined;
      }

      return entry.metadata;
    } catch {
      return undefined;
    }
  }

  async set(url: string, metadata: LinkMetadata): Promise<void> {
    await mkdir(this.#directory, { recursive: true });

    const path = this.#path(url);
    const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
    const entry: CacheEntry = { fetchedAt: Date.now(), metadata, url };

    await writeFile(temporaryPath, JSON.stringify(entry, null, 2), "utf8");
    await rename(temporaryPath, path);
  }
}

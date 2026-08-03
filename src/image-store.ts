import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImageCacheStore, ImageInput } from "./types.js";

export type FileSystemImageCacheOptions = {
  directory?: string;
  publicPath?: string;
};

const DEFAULT_DIRECTORY = "public/satteri-link-card";
const DEFAULT_PUBLIC_PATH = "/satteri-link-card";

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/vnd.microsoft.icon": "ico",
  "image/webp": "webp",
  "image/x-icon": "ico",
};

function contentType(input: string): string {
  return input.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function extensionFor(contentTypeValue: string): string {
  const extension = CONTENT_TYPE_EXTENSIONS[contentType(contentTypeValue)];
  if (!extension) {
    throw new Error(`Unsupported image content type: ${contentTypeValue}`);
  }
  return extension;
}

function keyFor(sourceUrl: URL): string {
  return createHash("sha256").update(sourceUrl.href).digest("hex");
}

function normalizePublicPath(publicPath: string): string {
  const normalized = `/${publicPath.replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "" : normalized;
}

function sourcePath(directory: string, sourceUrl: URL): string {
  return join(directory, keyFor(sourceUrl));
}

function publicSource(publicPath: string, sourceUrl: URL, filename: string): string {
  return `${publicPath}/${keyFor(sourceUrl)}/${filename}`;
}

export function createFileSystemImageCacheStore(
  options: FileSystemImageCacheOptions = {},
): ImageCacheStore {
  const directory = options.directory ?? DEFAULT_DIRECTORY;
  const publicPath = normalizePublicPath(options.publicPath ?? DEFAULT_PUBLIC_PATH);

  return {
    async get(sourceUrl) {
      const directoryPath = sourcePath(directory, sourceUrl);

      try {
        const entries = await readdir(directoryPath, { withFileTypes: true });
        const entry = entries.find(
          (candidate) => candidate.isFile() && candidate.name.startsWith("asset."),
        );
        return entry ? { src: publicSource(publicPath, sourceUrl, entry.name) } : undefined;
      } catch {
        return undefined;
      }
    },

    async put(sourceUrl, image: ImageInput) {
      const extension = extensionFor(image.contentType);
      const directoryPath = sourcePath(directory, sourceUrl);
      const filename = `asset.${extension}`;
      const path = join(directoryPath, filename);
      const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;

      await mkdir(directoryPath, { recursive: true });
      await writeFile(temporaryPath, image.bytes);
      await rename(temporaryPath, path);

      return { src: publicSource(publicPath, sourceUrl, filename) };
    },
  };
}

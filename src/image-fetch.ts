import type { ImageInput } from "./types.js";

export type ImageFetchOptions = {
  fetch: typeof globalThis.fetch;
  maxBytes: number;
  timeout: number;
};

const IMAGE_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/vnd.microsoft.icon",
  "image/webp",
  "image/x-icon",
]);

function declaredContentType(response: Response): string {
  return response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Link card image is too large");
  }

  if (!response.body) {
    throw new Error("Link card image response has no body");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      throw new Error("Link card image is too large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function fetchImage(url: URL, options: ImageFetchOptions): Promise<ImageInput> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout);

  try {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Link card image URL must use HTTP or HTTPS");
    }

    const response = await options.fetch(url, {
      headers: { accept: "image/*", "user-agent": "satteri-link-card" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Link card image request failed with ${response.status}`);
    }

    const responseContentType = declaredContentType(response);
    if (!IMAGE_CONTENT_TYPES.has(responseContentType)) {
      throw new Error(
        `Unsupported link card image content type: ${responseContentType || "unknown"}`,
      );
    }

    return {
      bytes: await readResponseBytes(response, options.maxBytes),
      contentType: responseContentType,
    };
  } finally {
    clearTimeout(timeout);
  }
}

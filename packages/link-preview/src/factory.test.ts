import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { createImageResolver, createMetadataResolver } from "./factory.ts";
import type { ImageCacheStore } from "./types.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createMetadataResolver", () => {
  test("uses resolver defaults without requiring transport options", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response("<title>Core defaults</title>", {
        headers: { "content-type": "text/html" },
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const resolveMetadata = createMetadataResolver();
    const metadata = await resolveMetadata(new URL("https://example.com/article"));

    expect(metadata?.title).toBe("Core defaults");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("createImageResolver", () => {
  test("applies its per-image byte limit before writing to the store", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      }),
    );
    const put = vi.fn().mockResolvedValue({ src: "/cached/image.png" });
    const store: ImageCacheStore = {
      get: vi.fn().mockResolvedValue(undefined),
      put,
    };
    const resolveImage = createImageResolver({ fetch, maxBytes: 2, store });

    const source = "https://example.com/image.png";
    expect(await resolveImage(source)).toBe(source);
    expect(put).not.toHaveBeenCalled();
  });
});

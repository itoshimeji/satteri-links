import { describe, expect, test, vi } from "vite-plus/test";
import { fetchImage } from "./image-fetch.ts";

function imageResponse(
  bytes: number[],
  contentType = "image/png",
  headers: Record<string, string> = {},
): Response {
  return new Response(Uint8Array.from(bytes), {
    headers: { "content-type": contentType, ...headers },
  });
}

function options(
  fetch: typeof globalThis.fetch,
  overrides: Partial<Parameters<typeof fetchImage>[1]> = {},
): Parameters<typeof fetchImage>[1] {
  return { fetch, maxBytes: 1024, timeout: 100, ...overrides };
}

describe("fetchImage", () => {
  test("reads a supported image response as bytes", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(imageResponse([1, 2, 3], "image/png; charset=binary"));

    await expect(
      fetchImage(new URL("https://example.com/card.png"), options(fetch)),
    ).resolves.toEqual({
      bytes: Uint8Array.from([1, 2, 3]),
      contentType: "image/png",
    });
  });

  test("rejects unsuccessful, non-image, and SVG responses", async () => {
    const unsuccessful = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("error", { status: 404 }));
    const nonImage = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("text", { headers: { "content-type": "text/plain" } }));
    const svg = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(imageResponse([1], "image/svg+xml"));

    await expect(
      fetchImage(new URL("https://example.com/missing"), options(unsuccessful)),
    ).rejects.toThrow("404");
    await expect(
      fetchImage(new URL("https://example.com/text"), options(nonImage)),
    ).rejects.toThrow("Unsupported link card image content type");
    await expect(fetchImage(new URL("https://example.com/icon.svg"), options(svg))).rejects.toThrow(
      "Unsupported link card image content type",
    );
  });

  test("enforces declared and streamed response size limits", async () => {
    const declared = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(imageResponse([1, 2, 3, 4, 5], "image/png", { "content-length": "5" }));
    const streamed = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(imageResponse([1, 2, 3, 4, 5], "image/png"));

    await expect(
      fetchImage(new URL("https://example.com/declared"), options(declared, { maxBytes: 4 })),
    ).rejects.toThrow("too large");
    await expect(
      fetchImage(new URL("https://example.com/streamed"), options(streamed, { maxBytes: 4 })),
    ).rejects.toThrow("too large");
  });

  test("aborts requests after the timeout", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason);
          });
        }),
    );

    await expect(
      fetchImage(new URL("https://example.com/slow"), options(fetch, { timeout: 1 })),
    ).rejects.toThrow();
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});

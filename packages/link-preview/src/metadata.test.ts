import { describe, expect, test, vi } from "vite-plus/test";
import { extractMetadata, fetchMetadata, type MetadataFetchOptions } from "./metadata.ts";

function options(
  fetch: typeof globalThis.fetch,
  overrides: Partial<MetadataFetchOptions> = {},
): MetadataFetchOptions {
  return {
    fetch,
    maxBytes: 1024,
    timeoutMs: 100,
    ...overrides,
  };
}

function htmlResponse(html: string, headers?: Record<string, string>): Response {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...headers,
    },
  });
}

describe("extractMetadata", () => {
  test("prefers Open Graph, Twitter, then regular metadata", () => {
    const metadata = extractMetadata(
      `
        <title>Document title</title>
        <meta name="description" content="Regular description">
        <meta name="twitter:title" content="Twitter title">
        <meta name="twitter:description" content="Twitter description">
        <meta property="og:title" content="OG title">
      `,
      new URL("https://example.com/article"),
    );

    expect(metadata.title).toBe("OG title");
    expect(metadata.description).toBe("Twitter description");
    expect(metadata).not.toHaveProperty("url");
  });

  test("extracts an Open Graph or application site name", () => {
    expect(
      extractMetadata(
        '<meta name="application-name" content="Application"><meta property="og:site_name" content="Open Graph">',
        new URL("https://example.com/"),
      ).siteName,
    ).toBe("Open Graph");
    expect(
      extractMetadata(
        '<meta name="application-name" content="Application">',
        new URL("https://example.com/"),
      ).siteName,
    ).toBe("Application");
  });

  test("resolves relative image URLs against the page URL", () => {
    const metadata = extractMetadata(
      '<meta property="og:image" content="../images/card.png">',
      new URL("https://example.com/posts/article"),
    );

    expect(metadata.image).toBe("https://example.com/images/card.png");
  });

  test("selects the highest-priority favicon and resolves it against the page URL", () => {
    const metadata = extractMetadata(
      `
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">
        <link rel="shortcut icon" href="/shortcut.ico">
        <link rel="icon" href="icons/favicon.svg">
      `,
      new URL("https://example.com/articles/page"),
    );

    expect(metadata.favicon).toBe("https://example.com/articles/icons/favicon.svg");
  });

  test("falls back to the origin favicon when no favicon link exists", () => {
    const metadata = extractMetadata("<title>Example</title>", new URL("https://example.com/page"));

    expect(metadata.favicon).toBe("https://example.com/favicon.ico");
  });

  test("falls back to the document title and hostname", () => {
    expect(
      extractMetadata("<title>Document title</title>", new URL("https://example.com/")).title,
    ).toBe("Document title");
    expect(extractMetadata("", new URL("https://example.com/")).title).toBe("example.com");
  });

  test("ignores invalid and non-HTTP image URLs", () => {
    for (const image of ["http://[invalid", "data:image/png;base64,AAAA"]) {
      const metadata = extractMetadata(
        `<meta property="og:image" content="${image}">`,
        new URL("https://example.com/"),
      );

      expect(metadata.image).toBeUndefined();
    }
  });
});

describe("fetchMetadata", () => {
  test("uses the final response URL to resolve metadata assets", async () => {
    const response = htmlResponse(
      '<title>Redirected</title><meta property="og:image" content="card.png">',
    );
    Object.defineProperty(response, "url", {
      value: "https://final.example.com/articles/one",
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);

    const metadata = await fetchMetadata(new URL("https://short.example/one"), options(fetch));

    expect(metadata.url).toBe("https://short.example/one");
    expect(metadata.image).toBe("https://final.example.com/articles/card.png");
  });

  test("rejects unsuccessful and non-HTML responses", async () => {
    const unsuccessful = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("error", { status: 503 }));
    const nonHtml = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response("{}", {
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      fetchMetadata(new URL("https://example.com/"), options(unsuccessful)),
    ).rejects.toThrow("503");
    await expect(fetchMetadata(new URL("https://example.com/"), options(nonHtml))).rejects.toThrow(
      "not HTML",
    );
  });

  test("enforces declared and streamed response size limits", async () => {
    const declared = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(htmlResponse("12345", { "content-length": "5" }));
    const streamed = vi.fn<typeof globalThis.fetch>().mockResolvedValue(htmlResponse("12345"));

    await expect(
      fetchMetadata(new URL("https://example.com/declared"), options(declared, { maxBytes: 4 })),
    ).rejects.toThrow("too large");
    await expect(
      fetchMetadata(new URL("https://example.com/streamed"), options(streamed, { maxBytes: 4 })),
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
      fetchMetadata(new URL("https://example.com/slow"), options(fetch, { timeoutMs: 1 })),
    ).rejects.toThrow();
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});

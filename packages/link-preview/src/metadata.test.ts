import { describe, expect, test, vi } from "vite-plus/test";
import { fetchMetadata, type MetadataFetchOptions } from "./metadata.ts";

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

async function extractMetadata(html: string, url: URL) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(htmlResponse(html));
  const { url: _url, ...metadata } = await fetchMetadata(
    url,
    options(fetch, { maxBytes: 1024 * 1024 }),
  );
  return metadata;
}

describe("extractMetadata", () => {
  test("prefers Open Graph, Twitter, then regular metadata", async () => {
    const metadata = await extractMetadata(
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

  test("extracts an Open Graph or application site name", async () => {
    expect(
      (
        await extractMetadata(
          '<meta name="application-name" content="Application"><meta property="og:site_name" content="Open Graph">',
          new URL("https://example.com/"),
        )
      ).siteName,
    ).toBe("Open Graph");
    expect(
      (
        await extractMetadata(
          '<meta name="application-name" content="Application">',
          new URL("https://example.com/"),
        )
      ).siteName,
    ).toBe("Application");
  });

  test("resolves relative image URLs against the page URL", async () => {
    const metadata = await extractMetadata(
      '<meta property="og:image" content="../images/card.png">',
      new URL("https://example.com/posts/article"),
    );

    expect(metadata.image).toBe("https://example.com/images/card.png");
  });

  test("selects the highest-priority favicon and resolves it against the page URL", async () => {
    const metadata = await extractMetadata(
      `
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">
        <link rel="shortcut icon" href="/shortcut.ico">
        <link rel="icon" href="icons/favicon.svg">
      `,
      new URL("https://example.com/articles/page"),
    );

    expect(metadata.favicon).toBe("https://example.com/articles/icons/favicon.svg");
  });

  test("falls back to the origin favicon when no favicon link exists", async () => {
    const metadata = await extractMetadata(
      "<title>Example</title>",
      new URL("https://example.com/page"),
    );

    expect(metadata.favicon).toBe("https://example.com/favicon.ico");
  });

  test("falls back to the document title and hostname", async () => {
    expect(
      (await extractMetadata("<title>Document title</title>", new URL("https://example.com/")))
        .title,
    ).toBe("Document title");
    expect((await extractMetadata("", new URL("https://example.com/"))).title).toBe("example.com");
  });

  test("ignores invalid and non-HTTP image URLs", async () => {
    for (const image of ["http://[invalid", "data:image/png;base64,AAAA"]) {
      const metadata = await extractMetadata(
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

  test("uses metadata in a short head even when the declared response is large", async () => {
    let cancelled = false;
    let chunksRead = 0;
    const chunks = [
      '<html><head><meta property="og:title" content="Overreacted"><meta property="og:image" content="/card.png"></head>',
      "<body>" + "x".repeat(1024 * 1024),
      "</body>",
    ];
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          controller.enqueue(new TextEncoder().encode(chunks[chunksRead++]));
          if (chunksRead === chunks.length) {
            controller.close();
          }
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(stream, {
        headers: { "content-type": "text/html", "content-length": "2000000" },
      }),
    );

    const metadata = await fetchMetadata(
      new URL("https://example.com/article"),
      options(fetch, { maxBytes: 1024 }),
    );

    expect(metadata.title).toBe("Overreacted");
    expect(metadata.image).toBe("https://example.com/card.png");
    expect(chunksRead).toBe(1);
    expect(cancelled).toBe(true);
  });

  test("searches the body only when the head has no real title", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        htmlResponse(
          '<html><head><meta name="description" content="From head"></head><body><meta property="og:title" content="From body"></body></html>',
        ),
      );

    const metadata = await fetchMetadata(new URL("https://example.com/"), options(fetch));

    expect(metadata.title).toBe("From body");
    expect(metadata.description).toBe("From head");
  });

  test("recognizes an omitted head end tag and split UTF-8 text", async () => {
    const html =
      '<html><head><title>日本語</title><body><meta property="og:title" content="Too late">';
    const bytes = new TextEncoder().encode(html);
    const split = bytes.indexOf(0xe6) + 1;
    const chunks = [bytes.subarray(0, split), bytes.subarray(split)];
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk) {
          controller.enqueue(chunk);
        } else {
          controller.close();
        }
      },
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(stream, { headers: { "content-type": "text/html" } }));

    const metadata = await fetchMetadata(new URL("https://example.com/"), options(fetch));

    expect(metadata.title).toBe("日本語");
  });

  test("stops scanning at the byte budget and keeps collected metadata", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        htmlResponse(
          '<head><meta name="description" content="Known"></head><body>' +
            "x".repeat(200) +
            '<meta property="og:title" content="Beyond budget">',
        ),
      );

    const metadata = await fetchMetadata(
      new URL("https://example.com/"),
      options(fetch, { maxBytes: 80 }),
    );

    expect(metadata.title).toBe("example.com");
    expect(metadata.description).toBe("Known");
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

  test("aborts while waiting for more body bytes", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>((_input, init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("<head></head><body>"));
          init?.signal?.addEventListener("abort", () => {
            controller.error(new Error("aborted"));
          });
        },
      });
      return Promise.resolve(new Response(stream, { headers: { "content-type": "text/html" } }));
    });

    await expect(
      fetchMetadata(new URL("https://example.com/slow-body"), options(fetch, { timeoutMs: 1 })),
    ).rejects.toThrow("aborted");
  });
});

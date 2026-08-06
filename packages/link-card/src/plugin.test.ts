import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { markdownToHtml } from "satteri";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { satteriLinkCard } from "./index.ts";
import { createFileSystemImageCacheStore } from "./image-store.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function imageResponse(bytes: number[], contentType: string): Response {
  return new Response(Uint8Array.from(bytes), {
    headers: { "content-type": contentType },
  });
}

function inputUrl(input: Parameters<typeof globalThis.fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

async function render(
  markdown: string,
  fetch: typeof globalThis.fetch,
  metadataCache: false | { directory: string } = false,
): Promise<string> {
  vi.stubGlobal("fetch", fetch);
  const result = await markdownToHtml(markdown, {
    hastPlugins: [satteriLinkCard({ metadataCache })],
  });
  return result.html;
}

describe("satteriLinkCard", () => {
  test("converts eligible URLs without changing other links", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      htmlResponse(`
        <meta property="og:title" content="Example article">
        <meta property="og:description" content="Article description">
        <meta property="og:image" content="/images/card.png">
      `),
    );
    const markdown = [
      "https://example.com/article",
      "",
      "[https://example.com/explicit](https://example.com/explicit)",
      "",
      "- https://example.com/list",
    ].join("\n");

    const html = await render(markdown, fetch);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(html).toContain('class="satteri-link-card"');
    expect(html).toContain("Example article");
    expect(html).toContain("Article description");
    expect(html).toContain('src="https://example.com/images/card.png"');
    expect(html).toContain(
      '<p><a href="https://example.com/explicit">https://example.com/explicit</a></p>',
    );
    expect(html).toContain(
      '<li><a href="https://example.com/list">https://example.com/list</a></li>',
    );
  });

  test("leaves ignored extensions unchanged without fetching metadata", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);
    const result = await markdownToHtml("https://example.com/video.mp4", {
      hastPlugins: [
        satteriLinkCard({
          metadataCache: false,
          ignoreExtensions: [".mp4"],
        }),
      ],
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.html).toBe(
      '<p><a href="https://example.com/video.mp4">https://example.com/video.mp4</a></p>\n',
    );
  });

  test("renders the discovered favicon by default", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        htmlResponse('<title>Example</title><link rel="icon" href="/favicon.ico">'),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await markdownToHtml("https://example.com/article", {
      hastPlugins: [satteriLinkCard({ metadataCache: false })],
    });

    expect(result.html).toContain('class="satteri-link-card__favicon"');
    expect(result.html).toContain('src="https://example.com/favicon.ico"');
  });

  test("allows metadata transformation without changing the card destination", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(htmlResponse("<title>Original title</title>"));
    vi.stubGlobal("fetch", fetch);
    const result = await markdownToHtml("https://example.com/article", {
      hastPlugins: [
        satteriLinkCard({
          metadataCache: false,
          transformMetadata: async (metadata) => ({
            ...metadata,
            title: "Transformed title",
            url: "https://attacker.example/",
          }),
        }),
      ],
    });

    expect(result.html).toContain("Transformed title");
    expect(result.html).toContain('href="https://example.com/article"');
    expect(result.html).not.toContain("attacker.example");
  });

  test("does not render a favicon when favicon is false", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        htmlResponse('<title>Example</title><link rel="icon" href="/favicon.ico">'),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await markdownToHtml("https://example.com/article", {
      hastPlugins: [satteriLinkCard({ metadataCache: false, favicon: false })],
    });

    expect(result.html).not.toContain("satteri-link-card__favicon");
  });

  test("caches thumbnails and favicons through the image cache", async () => {
    const directory = await mkdtemp(join(tmpdir(), "satteri-link-card-images-"));
    temporaryDirectories.push(directory);
    const imageStore = createFileSystemImageCacheStore({
      directory,
      publicPath: "/assets/cards",
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
      const href = inputUrl(input);
      if (href === "https://example.com/article") {
        return htmlResponse(
          '<meta property="og:image" content="https://cdn.example.com/card.png"><link rel="icon" href="https://cdn.example.com/favicon.ico">',
        );
      }
      if (href === "https://cdn.example.com/card.png") {
        return imageResponse([1, 2, 3], "image/png");
      }
      if (href === "https://cdn.example.com/favicon.ico") {
        return imageResponse([4, 5, 6], "image/x-icon");
      }
      throw new Error(`Unexpected URL: ${href}`);
    });
    vi.stubGlobal("fetch", fetch);
    const plugin = satteriLinkCard({
      metadataCache: false,
      imageCache: { store: imageStore },
    });

    const first = await markdownToHtml("https://example.com/article", {
      hastPlugins: [plugin],
    });
    const second = await markdownToHtml("https://example.com/article", {
      hastPlugins: [plugin],
    });

    expect(first.html).toContain("/assets/cards/");
    expect(first.html).toBe(second.html);
    expect(
      fetch.mock.calls.filter(([input]) => inputUrl(input) === "https://example.com/article"),
    ).toHaveLength(2);
    expect(
      fetch.mock.calls.filter(([input]) => inputUrl(input) === "https://cdn.example.com/card.png"),
    ).toHaveLength(1);
    expect(
      fetch.mock.calls.filter(
        ([input]) => inputUrl(input) === "https://cdn.example.com/favicon.ico",
      ),
    ).toHaveLength(1);
  });

  test("exposes one image size limit for cache downloads", async () => {
    const directory = await mkdtemp(join(tmpdir(), "satteri-link-card-images-"));
    temporaryDirectories.push(directory);
    const imageStore = createFileSystemImageCacheStore({
      directory,
      publicPath: "/assets/cards",
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
      const href = inputUrl(input);
      if (href === "https://example.com/article") {
        return htmlResponse(
          '<meta property="og:image" content="https://cdn.example.com/card.png">',
        );
      }
      return imageResponse([1, 2, 3], "image/png");
    });
    vi.stubGlobal("fetch", fetch);

    const result = await markdownToHtml("https://example.com/article", {
      hastPlugins: [
        satteriLinkCard({
          metadataCache: false,
          imageCache: { maxImageBytes: 2, store: imageStore },
        }),
      ],
    });

    expect(result.html).toContain('src="https://cdn.example.com/card.png"');
    expect(result.html).not.toContain("/assets/cards/");
  });

  test("keeps the original link when metadata fetching fails", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("error", { status: 500 }));

    const html = await render("https://example.com/failure", fetch);

    expect(html).toBe(
      '<p><a href="https://example.com/failure">https://example.com/failure</a></p>\n',
    );
  });

  test("integrates with the metadata file cache", async () => {
    const directory = await mkdtemp(join(tmpdir(), "satteri-link-card-"));
    temporaryDirectories.push(directory);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(htmlResponse("<title>Cached title</title>"));

    await render("https://example.com/cached", fetch, { directory });
    await render("https://example.com/cached", fetch, { directory });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("deduplicates concurrent requests for the same URL", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => response);
    vi.stubGlobal("fetch", fetch);
    const plugin = satteriLinkCard({ metadataCache: false });
    const renderOne = markdownToHtml("https://example.com/shared", {
      hastPlugins: [plugin],
    });
    const renderTwo = markdownToHtml("https://example.com/shared", {
      hastPlugins: [plugin],
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledTimes(1);
    resolveResponse?.(htmlResponse("<title>Shared title</title>"));

    const [one, two] = await Promise.all([renderOne, renderTwo]);
    expect(one.html).toContain("Shared title");
    expect(two.html).toContain("Shared title");
  });
});

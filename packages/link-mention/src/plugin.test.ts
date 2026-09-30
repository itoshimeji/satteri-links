import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { markdownToHtml } from "satteri";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { createFileSystemImageCacheStore, satteriLinkMention } from "./index.ts";

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
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function imageResponse(): Response {
  return new Response(Uint8Array.from([1, 2, 3]), { headers: { "content-type": "image/png" } });
}

function inputUrl(input: Parameters<typeof globalThis.fetch>[0]): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

async function render(markdown: string, fetch: typeof globalThis.fetch, options = {}) {
  vi.stubGlobal("fetch", fetch);
  const result = await markdownToHtml(markdown, {
    hastPlugins: [satteriLinkMention({ metadataCache: false, ...options })],
  });
  return result.html;
}

describe("satteriLinkMention", () => {
  test("shares request limits across documents and keeps plugin instances independent", async () => {
    const waiting = new Map<string, (response: Response) => void>();
    const fetch = vi.fn<typeof globalThis.fetch>(
      (input) =>
        new Promise<Response>((resolve) => {
          waiting.set(inputUrl(input), resolve);
        }),
    );
    const options = {
      metadataCache: false as const,
      fetch,
      maxConcurrentRequests: 1,
      maxConcurrentRequestsPerHost: 1,
      mention: { favicon: false },
    };
    const shared = satteriLinkMention(options);
    const independent = satteriLinkMention(options);
    const renderWith = (url: string, plugin: ReturnType<typeof satteriLinkMention>) =>
      markdownToHtml(`[](${url})`, { hastPlugins: [plugin] });
    const a = renderWith("https://example.com/a", shared);
    const b = renderWith("https://example.com/b", shared);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const c = renderWith("https://example.com/c", independent);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(waiting.has("https://example.com/b")).toBe(false);
    waiting.get("https://example.com/a")!(htmlResponse("<title>A</title>"));
    expect((await a).html).toContain("A");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    waiting.get("https://example.com/b")!(htmlResponse("<title>B</title>"));
    waiting.get("https://example.com/c")!(htmlResponse("<title>C</title>"));
    expect((await b).html).toContain("B");
    expect((await c).html).toContain("C");
  });

  test("uses a custom fetch for metadata without the image cache", async () => {
    const defaultFetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", defaultFetch);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        htmlResponse('<title>Custom title</title><link rel="icon" href="/favicon.ico">'),
      );

    const result = await markdownToHtml("[](https://example.com/article)", {
      hastPlugins: [satteriLinkMention({ metadataCache: false, fetch })],
    });

    expect(result.html).toContain("Custom title");
    expect(result.html).toContain('src="https://example.com/favicon.ico"');
    expect(fetch.mock.calls.map(([input]) => inputUrl(input))).toEqual([
      "https://example.com/article",
    ]);
    expect(defaultFetch).not.toHaveBeenCalled();
  });

  test("keeps the placeholder when a custom fetch rejects metadata", async () => {
    const defaultFetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", defaultFetch);
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("Rejected"));

    const result = await markdownToHtml("[](https://example.com/article)", {
      hastPlugins: [satteriLinkMention({ metadataCache: false, fetch })],
    });

    expect(result.html).toBe('<p><a href="https://example.com/article"></a></p>\n');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(defaultFetch).not.toHaveBeenCalled();
  });

  test("converts an empty Markdown link and preserves non-empty links", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        htmlResponse(
          '<meta property="og:site_name" content="Example"><meta property="og:title" content="Example title"><link rel="icon" href="/favicon.ico">',
        ),
      );
    const html = await render(
      [
        "[](https://example.com/article)",
        "",
        "https://example.com/bare",
        "",
        "[Read more](https://example.com/explicit)",
      ].join("\n"),
      fetch,
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(html).toContain('class="satteri-link-mention"');
    expect(html).toContain("Example");
    expect(html).toContain("Example title");
    expect(html).toContain('src="https://example.com/favicon.ico"');
    expect(html).toContain(
      '<p><a href="https://example.com/bare">https://example.com/bare</a></p>',
    );
    expect(html).toContain('<p><a href="https://example.com/explicit">Read more</a></p>');
  });

  test("applies enabled parts and their requested order", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        htmlResponse('<meta property="og:site_name" content="Example"><title>Title</title>'),
      );
    const html = await render("[](https://example.com/)", fetch, {
      mention: { favicon: false, siteName: true, title: true, order: ["title", "siteName"] },
      openInNewTab: false,
    });

    expect(html).not.toContain("favicon");
    expect(html).not.toContain('target="_blank"');
    expect(html.indexOf("Title")).toBeLessThan(html.indexOf("Example"));
  });

  test("omits an unavailable site name while preserving the title", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(htmlResponse("<title>Title</title>"));
    const html = await render("[](https://example.com/)", fetch, { mention: { favicon: false } });

    expect(html).toContain("Title");
    expect(html).not.toContain("satteri-link-mention__site-name");
  });

  test.each([false, true])("caches the discovered favicon (custom fetch: %s)", async (custom) => {
    const directory = await mkdtemp(join(tmpdir(), "satteri-link-mention-images-"));
    temporaryDirectories.push(directory);
    const imageStore = createFileSystemImageCacheStore({
      directory,
      publicPath: "/assets/mentions",
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
      const href = inputUrl(input);
      if (href === "https://example.com/article") {
        return htmlResponse(
          '<title>Title</title><link rel="icon" href="https://cdn.example.com/favicon.png">',
        );
      }
      if (href === "https://cdn.example.com/favicon.png") {
        return imageResponse();
      }
      throw new Error(`Unexpected URL: ${href}`);
    });

    const defaultFetch = custom ? vi.fn<typeof globalThis.fetch>() : fetch;
    const html = await render("[](https://example.com/article)", defaultFetch, {
      fetch: custom ? fetch : undefined,
      imageCache: { store: imageStore },
    });

    expect(html).toContain("/assets/mentions/");
    expect(fetch.mock.calls.map(([input]) => inputUrl(input))).toEqual([
      "https://example.com/article",
      "https://cdn.example.com/favicon.png",
    ]);
    if (custom) {
      expect(defaultFetch).not.toHaveBeenCalled();
    }
  });

  test("preserves the remote favicon URL when a custom fetch rejects its download", async () => {
    const directory = await mkdtemp(join(tmpdir(), "satteri-link-mention-images-"));
    temporaryDirectories.push(directory);
    const defaultFetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", defaultFetch);
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
      if (inputUrl(input) === "https://example.com/article") {
        return htmlResponse(
          '<title>Title</title><link rel="icon" href="https://cdn.example.com/favicon.png">',
        );
      }
      throw new Error("Rejected");
    });

    const result = await markdownToHtml("[](https://example.com/article)", {
      hastPlugins: [
        satteriLinkMention({
          fetch,
          metadataCache: false,
          imageCache: {
            store: createFileSystemImageCacheStore({ directory, publicPath: "/assets/mentions" }),
          },
        }),
      ],
    });

    expect(fetch.mock.calls.map(([input]) => inputUrl(input))).toEqual([
      "https://example.com/article",
      "https://cdn.example.com/favicon.png",
    ]);
    expect(result.html).toContain('src="https://cdn.example.com/favicon.png"');
    expect(result.html).not.toContain("/assets/mentions/");
    expect(defaultFetch).not.toHaveBeenCalled();
  });

  test("uses the metadata file cache", async () => {
    const directory = await mkdtemp(join(tmpdir(), "satteri-link-mention-metadata-"));
    temporaryDirectories.push(directory);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(htmlResponse("<title>Cached title</title>"));

    await render("[](https://example.com/cached)", fetch, {
      metadataCache: { directory },
      mention: { favicon: false },
    });
    await render("[](https://example.com/cached)", fetch, {
      metadataCache: { directory },
      mention: { favicon: false },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("leaves the placeholder unchanged when metadata resolution fails", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("error", { status: 500 }));
    await expect(render("[](https://example.com/failure)", fetch)).resolves.toBe(
      '<p><a href="https://example.com/failure"></a></p>\n',
    );
  });
});

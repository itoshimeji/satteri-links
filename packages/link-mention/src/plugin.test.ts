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

  test("caches the discovered favicon, not the destination document", async () => {
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

    const html = await render("[](https://example.com/article)", fetch, {
      imageCache: { store: imageStore },
    });

    expect(html).toContain("/assets/mentions/");
    expect(fetch.mock.calls.map(([input]) => inputUrl(input))).toEqual([
      "https://example.com/article",
      "https://cdn.example.com/favicon.png",
    ]);
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

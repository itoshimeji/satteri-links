import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { markdownToHtml } from "satteri";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { satteriLinkCard } from "./index.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
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

async function render(
  markdown: string,
  fetch: typeof globalThis.fetch,
  metadataCache: false | { directory: string } = false,
): Promise<string> {
  const result = await markdownToHtml(markdown, {
    hastPlugins: [satteriLinkCard({ metadataCache, fetch })],
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
    const result = await markdownToHtml("https://example.com/video.mp4", {
      hastPlugins: [
        satteriLinkCard({
          metadataCache: false,
          fetch,
          ignoreExtensions: [".mp4"],
        }),
      ],
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.html).toBe(
      '<p><a href="https://example.com/video.mp4">https://example.com/video.mp4</a></p>\n',
    );
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
    const plugin = satteriLinkCard({ metadataCache: false, fetch });
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

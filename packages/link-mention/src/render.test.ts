import { describe, expect, test } from "vite-plus/test";
import { renderLinkMention } from "./render.ts";
import type { MentionOptions } from "./types.ts";

const allParts: Required<MentionOptions> = {
  favicon: true,
  siteName: true,
  title: true,
  order: ["favicon", "siteName", "title"],
};

describe("renderLinkMention", () => {
  test("renders enabled metadata parts in the requested order", () => {
    const mention = renderLinkMention(
      {
        favicon: "https://example.com/favicon.ico",
        siteName: "Example",
        title: "Example title",
        url: "https://www.example.com/article",
      },
      { mention: allParts, openInNewTab: true },
    );

    expect(mention.properties).toMatchObject({
      className: ["satteri-link-mention"],
      href: "https://www.example.com/article",
      rel: ["noopener", "noreferrer"],
      target: "_blank",
    });
    expect(
      mention.children.map((child) =>
        child.type === "element" ? child.properties.className : undefined,
      ),
    ).toEqual([
      ["satteri-link-mention__favicon"],
      ["satteri-link-mention__site-name"],
      ["satteri-link-mention__title"],
    ]);
  });

  test("omits disabled and unavailable parts", () => {
    const mention = renderLinkMention(
      { title: "Example title", url: "https://example.com/" },
      {
        mention: {
          favicon: true,
          siteName: false,
          title: true,
          order: ["favicon", "siteName", "title"],
        },
        openInNewTab: false,
      },
    );

    expect(mention.properties).not.toHaveProperty("target");
    expect(mention.children).toEqual([
      expect.objectContaining({
        children: [{ type: "text", value: "Example title" }],
        properties: { className: ["satteri-link-mention__title"] },
      }),
    ]);
  });

  test("rejects duplicate parts", () => {
    expect(() =>
      renderLinkMention(
        { title: "Example", url: "https://example.com/" },
        {
          mention: { favicon: false, siteName: false, title: true, order: ["title", "title"] },
          openInNewTab: true,
        },
      ),
    ).toThrow("duplicate");
  });
});

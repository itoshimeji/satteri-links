import type { HastNode, HastVisitorContext } from "satteri";
import { describe, expect, test } from "vite-plus/test";
import { findBareUrl } from "./candidate.ts";

type HastElement = Extract<HastNode, { type: "element" }>;
type HastRoot = Extract<HastNode, { type: "root" }>;

function paragraph(href: string, start = 0, end = href.length): HastElement {
  return {
    type: "element",
    tagName: "p",
    properties: {},
    children: [
      {
        type: "element",
        tagName: "a",
        properties: { href },
        children: [{ type: "text", value: href }],
      },
    ],
    position: {
      start: { line: 1, column: 1, offset: start },
      end: { line: 1, column: end - start + 1, offset: end },
    },
  };
}

function context(
  source: string,
  node: HastElement,
  parent: HastRoot | HastElement = {
    type: "root",
    children: [node],
  },
): HastVisitorContext {
  return {
    source,
    parent: () => parent,
    textContent: (target: Readonly<HastNode>) => {
      if (target.type !== "element") {
        return "";
      }
      return target.children.map((child) => (child.type === "text" ? child.value : "")).join("");
    },
  } as unknown as HastVisitorContext;
}

describe("findBareUrl", () => {
  test("accepts a root-level HTTP or HTTPS URL", () => {
    for (const href of ["https://example.com/path", "http://example.com/"]) {
      const node = paragraph(href);

      expect(findBareUrl(node, context(href, node))?.href).toBe(href);
    }
  });

  test.each(["日本語の段落\n\n", "撮影🎥の記録\n\n"])("uses UTF-16 offsets after %s", (prefix) => {
    const href = "https://example.com/article";
    const source = `${prefix}${href}`;
    const start = prefix.length;
    const node = paragraph(href, start, start + href.length);

    expect(findBareUrl(node, context(source, node))?.href).toBe(href);
  });

  test("rejects an explicitly authored Markdown link", () => {
    const href = "https://example.com/";
    const source = `[${href}](${href})`;
    const node = paragraph(href, 0, source.length);

    expect(findBareUrl(node, context(source, node))).toBeUndefined();
  });

  test("rejects nested, inline, and non-HTTP links", () => {
    const nestedHref = "https://example.com/list";
    const nested = paragraph(nestedHref);
    const listItem: HastElement = {
      type: "element",
      tagName: "li",
      properties: {},
      children: [nested],
    };

    expect(findBareUrl(nested, context(nestedHref, nested, listItem))).toBeUndefined();

    const inline = paragraph("https://example.com/inline");
    inline.children.push({ type: "text", value: " trailing text" });
    expect(
      findBareUrl(inline, context("https://example.com/inline trailing text", inline)),
    ).toBeUndefined();

    for (const href of ["mailto:hello@example.com", "ftp://example.com/file"]) {
      const node = paragraph(href);
      expect(findBareUrl(node, context(href, node))).toBeUndefined();
    }
  });
});

import type { HastNode, HastVisitorContext } from "satteri";
import { describe, expect, test } from "vite-plus/test";
import { findEmptyUrl } from "./candidate.ts";

type HastElement = Extract<HastNode, { type: "element" }>;

function link(href: string, children: HastElement["children"] = []): HastElement {
  return {
    children,
    properties: { href },
    tagName: "a",
    type: "element",
  };
}

function context(): HastVisitorContext {
  return {
    textContent: (node) => (node.type === "element" && node.children.length > 0 ? "content" : ""),
  } as HastVisitorContext;
}

describe("findEmptyUrl", () => {
  test("accepts an empty HTTP or HTTPS link", () => {
    for (const href of ["https://example.com/path", "http://example.com/"]) {
      expect(findEmptyUrl(link(href), context())?.href).toBe(href);
    }
  });

  test("rejects links with authored content, invalid URLs, and non-web schemes", () => {
    expect(
      findEmptyUrl(link("https://example.com", [{ type: "text", value: "Read more" }]), context()),
    ).toBeUndefined();

    for (const href of ["mailto:hello@example.com", "ftp://example.com/file", "not a URL"]) {
      expect(findEmptyUrl(link(href), context())).toBeUndefined();
    }
  });
});

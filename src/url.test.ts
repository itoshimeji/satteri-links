import { describe, expect, test } from "vite-plus/test";
import { hasIgnoredExtension } from "./url.ts";

describe("hasIgnoredExtension", () => {
  test.each([
    ["https://example.com/foo/bar.mp4", true],
    ["https://example.com/foo/bar.MP4", true],
    ["https://example.com/foo/bar.mp4?download=1", true],
    ["https://example.com/foo/bar.mp4#preview", true],
    ["https://example.com/foo.mp4/bar", false],
    ["https://example.com/foo/bar.mp4.html", false],
    ["https://example.com/foo/bar", false],
  ])("returns %s for %s", (href, expected) => {
    expect(hasIgnoredExtension(new URL(href), [".pdf", ".mp4", ".mp3"])).toBe(expected);
  });

  test("returns false when no extensions are configured", () => {
    expect(hasIgnoredExtension(new URL("https://example.com/foo/bar.mp4"), [])).toBe(false);
  });
});

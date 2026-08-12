import { markdownToHtml } from "satteri";
import { describe, expect, test } from "vite-plus/test";
import { satteriHeadingLink } from "./plugin.js";
import type { SatteriHeadingLinkOptions } from "./types.js";

function render(markdown: string, options: SatteriHeadingLinkOptions = {}) {
  const result = markdownToHtml(markdown, {
    features: { headingAttributes: true },
    hastPlugins: [satteriHeadingLink(options)],
  });
  return result.html;
}

describe("satteriHeadingLink", () => {
  test("renders an accessible sibling link for every heading level", () => {
    const html = render("# One {#one}\n\n## Two {#two}\n\n### Three {#three}");

    expect(html).toContain(
      '<div class="satteri-heading-link satteri-heading-link--h1" data-satteri-heading-link>',
    );
    expect(html).toContain('<h2 id="two" class="satteri-heading-link__heading">Two</h2>');
    expect(html).toContain(
      '<a href="#two" aria-labelledby="two" class="satteri-heading-link__link">',
    );
    expect(html).toContain('class="satteri-heading-link__icon" aria-hidden');
    expect(html).not.toContain('aria-hidden="true" href="#two"');
  });

  test("uses plain text from nested heading markup for a custom name", () => {
    const html = render("## Some _important_ `HTML` {#some-important-html}", {
      accessibleName: ({ text }) => `Link to section “${text}”`,
    });

    expect(html).toContain('aria-label="Link to section “Some important HTML”"');
    expect(html).not.toContain('aria-labelledby="some-important-html"');
  });

  test("falls back to the heading name when a custom label is empty", () => {
    const html = render("## Empty label {#empty-label}", { accessibleName: () => "" });

    expect(html).toContain('aria-labelledby="empty-label"');
    expect(html).not.toContain("aria-label=");
  });

  test("supports text and callback icons", () => {
    const textIcon = render("## Text icon {#text-icon}", { icon: "#" });
    const callbackIcon = render("## Callback icon {#callback-icon}", {
      icon: ({ level }) => (level === 2 ? "§" : "#"),
    });

    expect(textIcon).toContain(">#</span>");
    expect(callbackIcon).toContain(">§</span>");
  });

  test("can omit the icon while retaining the named link", () => {
    const html = render("## No icon {#no-icon}", { icon: false });

    expect(html).toContain(
      '<a href="#no-icon" aria-labelledby="no-icon" class="satteri-heading-link__link"></a>',
    );
    expect(html).not.toContain("satteri-heading-link__icon");
  });

  test("places the link before the heading in start mode", () => {
    const html = render("## Start placement {#start-placement}", { placement: "start" });

    expect(html).toContain(
      '<a href="#start-placement" aria-labelledby="start-placement" class="satteri-heading-link__link">',
    );
    expect(html).toContain(
      '</a><h2 id="start-placement" class="satteri-heading-link__heading">Start placement</h2>',
    );
  });

  test("limits levels", () => {
    const html = render("# One {#one}\n\n## Two {#two}", { levels: [2] });

    expect(html).toContain('<h1 id="one">One</h1>');
    expect(html).toContain("satteri-heading-link--h2");
    expect(html).not.toContain("satteri-heading-link--h1");
  });

  test("skips missing IDs by default and can fail explicitly", () => {
    expect(markdownToHtml("## No ID", { hastPlugins: [satteriHeadingLink()] })).toMatchObject({
      html: "<h2>No ID</h2>\n",
    });

    expect(() =>
      markdownToHtml("## No ID", { hastPlugins: [satteriHeadingLink({ missingId: "error" })] }),
    ).toThrow("missing a non-empty id");
  });

  test("does not double-wrap when installed twice", () => {
    const result = markdownToHtml("## Once {#once}", {
      features: { headingAttributes: true },
      hastPlugins: [satteriHeadingLink(), satteriHeadingLink()],
    });

    expect(result.html.match(/data-satteri-heading-link/g)).toHaveLength(1);
    expect(result.html.match(/satteri-heading-link__link/g)).toHaveLength(1);
  });
});

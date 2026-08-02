import { describe, expect, test } from "vite-plus/test";
import { renderLinkCard } from "./render.ts";

describe("renderLinkCard", () => {
  test("renders all card fields with stable class names", () => {
    const card = renderLinkCard({
      url: "https://www.example.com/article",
      title: "Example title",
      description: "Example description",
      image: "https://cdn.example.com/card.png",
    });

    expect(card.tagName).toBe("a");
    expect(card.properties).toMatchObject({
      className: ["satteri-link-card"],
      href: "https://www.example.com/article",
      rel: ["noopener", "noreferrer"],
      target: "_blank",
    });
    expect(card.children).toEqual([
      expect.objectContaining({
        tagName: "span",
        properties: { className: ["satteri-link-card__body"] },
        children: [
          expect.objectContaining({
            properties: { className: ["satteri-link-card__title"] },
            children: [{ type: "text", value: "Example title" }],
          }),
          expect.objectContaining({
            properties: { className: ["satteri-link-card__description"] },
            children: [{ type: "text", value: "Example description" }],
          }),
          expect.objectContaining({
            properties: { className: ["satteri-link-card__host"] },
            children: [{ type: "text", value: "www.example.com" }],
          }),
        ],
      }),
      expect.objectContaining({
        properties: { className: ["satteri-link-card__media"] },
        children: [
          expect.objectContaining({
            tagName: "img",
            properties: expect.objectContaining({
              className: ["satteri-link-card__image"],
              src: "https://cdn.example.com/card.png",
            }),
          }),
        ],
      }),
    ]);
  });

  test("omits optional fields and new-tab attributes when disabled", () => {
    const card = renderLinkCard({ url: "https://example.com/", title: "Example" }, false);

    expect(card.properties).not.toHaveProperty("target");
    expect(card.properties).not.toHaveProperty("rel");
    expect(card.children).toHaveLength(1);
    expect(JSON.stringify(card)).not.toContain("satteri-link-card__description");
    expect(JSON.stringify(card)).not.toContain("satteri-link-card__media");
  });
});

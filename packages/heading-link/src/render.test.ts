import type { Element } from "hast";
import { describe, expect, test } from "vite-plus/test";
import { renderHeadingLink } from "./render.js";

const heading: Element = {
  type: "element",
  tagName: "h2",
  properties: { id: "installation", className: ["source-heading"] },
  children: [{ type: "text", value: "Installation" }],
};

const info = {
  id: "installation",
  text: "Installation",
  level: 2 as const,
  heading,
};

describe("renderHeadingLink", () => {
  test("renders a sibling heading and named link", () => {
    const wrapper = renderHeadingLink({}, info, undefined);

    expect(wrapper).toMatchObject({
      tagName: "div",
      properties: {
        className: ["satteri-heading-link", "satteri-heading-link--h2"],
        "data-satteri-heading-link": true,
      },
      children: [
        {
          tagName: "h2",
          properties: {
            id: "installation",
            className: ["satteri-heading-link__heading", "source-heading"],
          },
        },
        {
          tagName: "a",
          properties: {
            href: "#installation",
            ariaLabelledby: "installation",
            className: ["satteri-heading-link__link"],
          },
        },
      ],
    });
  });

  test("places the link before the heading in start mode", () => {
    const wrapper = renderHeadingLink({ placement: "start" }, info, undefined);

    expect(wrapper).toMatchObject({
      properties: {
        className: ["satteri-heading-link", "satteri-heading-link--h2"],
      },
      children: [{ tagName: "a" }, { tagName: "h2" }],
    });
  });

  test("renders a custom accessible name", () => {
    const wrapper = renderHeadingLink({}, info, "Link to Installation");

    expect(wrapper).toMatchObject({
      children: [
        {},
        {
          properties: {
            href: "#installation",
            ariaLabel: "Link to Installation",
            className: ["satteri-heading-link__link"],
          },
        },
      ],
    });
  });

  test("supports custom and omitted icons", () => {
    const custom = renderHeadingLink({ icon: "#" }, info, undefined);
    const withoutIcon = renderHeadingLink({ icon: false }, info, undefined);

    expect(custom.children[1]).toMatchObject({ children: [{ children: [{ value: "#" }] }] });
    expect(withoutIcon.children[1]).toMatchObject({ children: [] });
  });
});

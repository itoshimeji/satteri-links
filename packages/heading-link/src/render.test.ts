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

  test("merges custom classes and protects structural properties", () => {
    const wrapper = renderHeadingLink(
      {
        wrapperProperties: { className: ["custom-wrapper"] },
        headingProperties: { className: ["custom-heading"], id: "wrong" },
        linkProperties: { className: ["custom-link"], href: "#wrong", tabIndex: -1 },
      },
      info,
      "Link to Installation",
    );

    expect(wrapper).toMatchObject({
      properties: {
        className: ["satteri-heading-link", "satteri-heading-link--h2", "custom-wrapper"],
      },
      children: [
        {
          properties: {
            id: "installation",
            className: ["satteri-heading-link__heading", "source-heading", "custom-heading"],
          },
        },
        {
          properties: {
            href: "#installation",
            ariaLabel: "Link to Installation",
            className: ["satteri-heading-link__link", "custom-link"],
          },
        },
      ],
    });
    expect((wrapper.children[1] as Element).properties).not.toHaveProperty("tabIndex");
  });

  test("supports custom and omitted icons", () => {
    const custom = renderHeadingLink({ icon: "#" }, info, undefined);
    const withoutIcon = renderHeadingLink({ icon: false }, info, undefined);

    expect(custom.children[1]).toMatchObject({ children: [{ children: [{ value: "#" }] }] });
    expect(withoutIcon.children[1]).toMatchObject({ children: [] });
  });
});

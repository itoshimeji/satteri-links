import type { HastNode } from "satteri";
import type { LinkMetadata } from "./types.js";

type HastElement = Extract<HastNode, { type: "element" }>;
type HastText = Extract<HastNode, { type: "text" }>;

function text(value: string): HastText {
  return { type: "text", value };
}

function element(
  tagName: string,
  properties: HastElement["properties"],
  children: HastElement["children"],
): HastElement {
  return { children, properties, tagName, type: "element" };
}

export function renderLinkCard(metadata: LinkMetadata, openInNewTab = true): HastElement {
  const url = new URL(metadata.url);
  const body = element("span", { className: ["satteri-link-card__body"] }, [
    element("span", { className: ["satteri-link-card__title"] }, [text(metadata.title)]),
    ...(metadata.description
      ? [
          element("span", { className: ["satteri-link-card__description"] }, [
            text(metadata.description),
          ]),
        ]
      : []),
    element("span", { className: ["satteri-link-card__host"] }, [text(url.hostname)]),
  ]);

  return element(
    "a",
    {
      className: ["satteri-link-card"],
      href: metadata.url,
      ...(openInNewTab ? { rel: ["noopener", "noreferrer"], target: "_blank" } : {}),
    },
    [
      body,
      ...(metadata.image
        ? [
            element("span", { className: ["satteri-link-card__media"] }, [
              element(
                "img",
                {
                  alt: "",
                  className: ["satteri-link-card__image"],
                  decoding: "async",
                  loading: "lazy",
                  src: metadata.image,
                },
                [],
              ),
            ]),
          ]
        : []),
    ],
  );
}

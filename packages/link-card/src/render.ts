import type { HastNode } from "satteri";
import type { LinkMetadata, ThumbnailOptions } from "./types.js";

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

type renderLinkCardOptions = {
  shortenUrl: boolean;
  thumbnail: false | ThumbnailOptions;
  favicon: boolean;
  openInNewTab: boolean;
};

export function renderLinkCard(
  metadata: LinkMetadata,
  options: renderLinkCardOptions,
): HastElement {
  const url = new URL(metadata.url);
  const thumbnailPosition =
    options.thumbnail === false ? undefined : (options.thumbnail.position ?? "right");
  // Build HAST nodes instead of interpolating raw HTML. Sätteri's serializer
  // then escapes metadata text and attributes as part of normal HTML output.
  const host = element("span", { className: ["satteri-link-card__host"] }, [
    text(options.shortenUrl ? url.hostname : url.href),
  ]);
  const meta = element("span", { className: ["satteri-link-card__meta"] }, [
    ...(options.favicon && metadata.favicon
      ? [
          element(
            "img",
            {
              alt: "",
              className: ["satteri-link-card__favicon"],
              decoding: "async",
              src: metadata.favicon,
            },
            [],
          ),
        ]
      : []),
    host,
  ]);
  const body = element("span", { className: ["satteri-link-card__body"] }, [
    element("span", { className: ["satteri-link-card__title"] }, [text(metadata.title)]),
    ...(metadata.description
      ? [
          element("span", { className: ["satteri-link-card__description"] }, [
            text(metadata.description),
          ]),
        ]
      : []),
    meta,
  ]);

  function createLinkCard(children: HastElement[]): HastElement {
    return element(
      "a",
      {
        className: ["satteri-link-card"],
        href: metadata.url,
        ...(options.openInNewTab ? { rel: ["noopener", "noreferrer"], target: "_blank" } : {}),
      },
      [...children],
    );
  }

  function createMedia(src: string): HastElement {
    return element("span", { className: ["satteri-link-card__media"] }, [
      element(
        "img",
        {
          alt: "",
          className: ["satteri-link-card__image"],
          decoding: "async",
          loading: "lazy",
          src,
        },
        [],
      ),
    ]);
  }

  return metadata.image !== undefined && thumbnailPosition !== undefined
    ? createLinkCard(
        thumbnailPosition === "right"
          ? [body, createMedia(metadata.image)]
          : [createMedia(metadata.image), body],
      )
    : createLinkCard([body]);
}

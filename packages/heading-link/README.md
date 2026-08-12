# 🔗 satteri-heading-link

A Sätteri HAST plugin that adds accessible, keyboard-operable permalinks beside
headings at build time.

> [!WARNING]
> This package is experimental. Its API, generated HTML, CSS class names, and
> behavior may change incompatibly between releases.

[View live examples](https://satteri-links.hamazaki.me/heading-link/).

## ✨ Features

- Adds a real link beside every selected heading that already has an `id`
- Keeps the heading and permalink as sibling elements
- Names the icon-only link with the visible heading through `aria-labelledby`
- Supports text, HAST, callback, and CSS-owned icons
- Provides optional preset CSS without injecting styles
- Does not add browser JavaScript or generate heading IDs

## 📦 Installation

```sh
pnpm add satteri-heading-link satteri
```

Node.js 22 or newer is required.

## 🚀 Sätteri setup

The plugin runs after a heading-ID plugin. This example uses an explicit heading
attribute so the core Sätteri pipeline is self-contained:

```ts
import { markdownToHtml } from "satteri";
import { satteriHeadingLink } from "satteri-heading-link";

const result = await markdownToHtml("## Installation {#installation}", {
  features: { headingAttributes: true },
  hastPlugins: [satteriHeadingLink()],
});
```

In a larger pipeline, register your slug or heading-ID plugin before
`satteriHeadingLink()`. Headings without IDs are skipped by default. The plugin
does not invent slugs, so IDs stay consistent with your table of contents and
metadata.

## 🌌 Astro setup

Astro's Sätteri processor provides the heading-ID plugin separately. Register
the two plugins explicitly and keep the ID plugin first:

```sh
pnpm add @astrojs/markdown-satteri astro satteri satteri-heading-link
```

```js
import { satteri, satteriHeadingIdsPlugin } from "@astrojs/markdown-satteri";
import { defineConfig } from "astro/config";
import { satteriHeadingLink } from "satteri-heading-link";

export default defineConfig({
  markdown: {
    processor: satteri({
      hastPlugins: [() => satteriHeadingIdsPlugin(), satteriHeadingLink()],
    }),
  },
});
```

The factory form creates a fresh slugger for each document. Keeping the plugins
in this order also keeps rendered IDs and Astro's `getHeadings()` metadata in
sync.

## 🎨 Styling

The plugin emits class names but does not inject CSS. Import the optional preset
once from a shared Astro layout or another global stylesheet entry:

```astro
---
import "satteri-heading-link/preset.css";
---
```

You can omit the preset and define the styles yourself. The generated elements
use these stable classes for the current release:

- `.satteri-heading-link`
- `.satteri-heading-link--h1` through `.satteri-heading-link--h6`
- `.satteri-heading-link__heading`
- `.satteri-heading-link__link`
- `.satteri-heading-link__icon`

The preset provides GitHub Markdown-inspired heading typography, spacing, and
rules, plus a visible `:focus-visible` outline, a larger pointer target, icon
reveal on hover, and wrapping that keeps the heading's final word with its icon.
It does not provide the accessible name.

Because the heading and permalink share a wrapper, the wrapper owns visual
heading styles such as font size, margin, padding, and borders. The child
heading inherits those styles. If you omit the preset, apply your heading theme
to `.satteri-heading-link--h1` through `.satteri-heading-link--h6` and reset the
child heading's block styles. Applying the same relative font size to both the
wrapper and child heading will compound the size.

```css
.satteri-heading-link--h2 {
  margin-block: 1.5rem 1rem;
  border-block-end: 1px solid #d1d9e0;
  font-size: 1.5em;
}

.satteri-heading-link > .satteri-heading-link__heading {
  display: inline;
  margin: 0;
  padding: 0;
  border: 0;
  color: inherit;
  font: inherit;
}
```

The preset applies `scroll-margin-block-start: 1.5rem` to the child heading,
which retains the generated `id`. Override it when a fixed header requires a
larger offset:

```css
.satteri-heading-link__heading {
  scroll-margin-block-start: 5rem;
}
```

## ⚙️ Options

```ts
satteriHeadingLink({
  levels: [2, 3],
  accessibleName: ({ text }) => `Link to section “${text}”`,
  icon: "#",
  linkProperties: { dataTestId: "heading-link" },
  headingProperties: { dataSectionHeading: true },
  wrapperProperties: { className: ["prose-heading-link"] },
  missingId: "warn",
});
```

| Option              | Default            | Description                                                                         |
| ------------------- | ------------------ | ----------------------------------------------------------------------------------- |
| `levels`            | all heading levels | Heading levels to decorate.                                                         |
| `accessibleName`    | `"heading"`        | Uses `aria-labelledby`, or a callback for a localized `aria-label`.                 |
| `icon`              | built-in SVG       | Accepts a string, HAST content, callback, or `false`.                               |
| `linkProperties`    | `{}`               | Extra HAST properties for the link.                                                 |
| `headingProperties` | `{}`               | Extra HAST properties for the heading.                                              |
| `wrapperProperties` | `{}`               | Extra HAST properties for the wrapper.                                              |
| `missingId`         | `"skip"`           | Handles selected headings without a non-empty ID: `"skip"`, `"warn"`, or `"error"`. |

Custom classes are merged with the package classes. The library keeps the
heading ID, link `href`, accessible-name attributes, icon `aria-hidden`, and
wrapper marker under its control.

### Accessible names

The default output references the visible heading:

```html
<a href="#installation" aria-labelledby="installation">
  <!-- decorative icon -->
</a>
```

Use a callback when the link needs a localized or more descriptive label:

```ts
satteriHeadingLink({
  accessibleName: ({ text }) => `「${text}」へのリンク`,
});
```

If the callback returns an empty string, the plugin reports a warning and falls
back to the heading text.

### Icons

The default icon is a decorative SVG informed by Starlight's `link-alt` icon.
A string is useful for a simple symbol:

```ts
satteriHeadingLink({ icon: "#" });
satteriHeadingLink({ icon: ({ level }) => (level === 2 ? "§" : "#") });
```

HAST elements and arrays of HAST content are also accepted:

```ts
satteriHeadingLink({
  icon: {
    type: "element",
    tagName: "svg",
    properties: { viewBox: "0 0 24 24", focusable: "false" },
    children: [],
  },
});
```

Use `icon: false` when your own CSS draws the visual icon. The icon wrapper is
always `aria-hidden` because the link gets its name from the heading.

## ♿ Accessibility

The permalink is a native `<a href>` element, so it is keyboard-operable and is
announced as a link by assistive technology. Its accessible name comes from the
visible heading through `aria-labelledby`; the decorative icon is not announced.

The heading and link are siblings rather than putting a link inside the
heading. This keeps heading navigation clean, avoids nested links when a
heading already contains a link, and leaves the heading's accessible name as
its title.

The HTML remains meaningful without the preset. If you provide custom CSS,
keep the link in the tab order, preserve a visible focus state, and keep a
usable pointer target even when the icon is visually hidden.

## 🔁 Relationship to other plugins

`rehype-autolink-headings` and `satteri-autolink-headings` support multiple
placement behaviors and general AST transformations. This package chooses one
canonical sibling structure and focuses on accessible defaults and production
CSS.

It does not replace a slug or heading-ID plugin. In Astro, register
`satteriHeadingIdsPlugin()` before `satteriHeadingLink()` as shown above.

The DOM and CSS decisions are informed by Starlight's heading anchor-link
implementation. See [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) for the
reference commit and license notice.

## 🔒 Security and limitations

Custom HAST properties and icon nodes are emitted into the generated HTML. Do
not construct them from untrusted input without an appropriate sanitizer.

The plugin only decorates headings with existing IDs and does not run browser
JavaScript. It does not provide slug generation, table-of-contents generation,
or client-side copy behavior.

## 🛠️ Development

```sh
vp install
vp check
vp test
vp pack
```

## 📄 License

[MIT](./LICENSE). Starlight's MIT notice is included in
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

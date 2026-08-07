# Satteri Links

Link-related plugins for [Sätteri](https://github.com/bruits/satteri), developed
and released from one monorepo.

| Package                                              | Description                                               |
| ---------------------------------------------------- | --------------------------------------------------------- |
| [`satteri-link-card`](./packages/link-card)          | Turns a standalone URL into a link card at build time.    |
| [`satteri-link-mention`](./packages/link-mention)    | Turns an empty Markdown link into an inline mention.      |
| [`@itoshinji/link-preview`](./packages/link-preview) | Framework-independent link metadata and image resolution. |

Most Satteri users should install a feature package such as `satteri-link-card` or
`satteri-link-mention`.
`@itoshinji/link-preview` is framework-independent and can also be used directly
by other build-time integrations.

## Development

```sh
vp install
pnpm check
pnpm test
pnpm build
```

## License

[MIT](./LICENSE)

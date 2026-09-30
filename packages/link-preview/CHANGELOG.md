# @itoshinji/link-preview

## 0.2.0

### Minor Changes

- 198531f: Add configurable request concurrency limits to link previews, cards, and mentions.
  By default, each plugin instance shares a budget of 64 active HTTP requests and
  4 requests per initial URL hostname across metadata, thumbnails, and favicons.
  Cache hits and deduplicated requests do not consume slots, and queue time does
  not count toward communication timeouts.

  Expose custom fetch implementations in card and mention options for proxies,
  custom headers, and controlled transports. Link preview consumers can use the
  new shared metadata/image resolver factory and exported concurrency option types.

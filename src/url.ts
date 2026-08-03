export function hasIgnoredExtension(url: URL, extensions: string[]): boolean {
  const pathname = url.pathname.toLowerCase();

  for (const extension of extensions) {
    if (pathname.endsWith(extension.toLowerCase())) {
      return true;
    }
  }

  return false;
}

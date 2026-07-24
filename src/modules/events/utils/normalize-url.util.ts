export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    let href = parsed.href;
    if (!parsed.search && !parsed.hash) {
      href = href.replace(/\/$/, '');
    }
    return href;
  } catch {
    return url.replace(/\/$/, '');
  }
}

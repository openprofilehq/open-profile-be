export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.href.replace(/\/$/, '');
  } catch {
    return url.replace(/\/$/, '');
  }
}

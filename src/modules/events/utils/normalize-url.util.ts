export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.href.replace(/\/$/, '').toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

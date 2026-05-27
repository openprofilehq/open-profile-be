export const SUPPORTED_SOCIAL_ICONS = [
  'insta',
  'twitter',
  'linkedin',
  'github',
  'youtube',
  'tiktok',
  'behance',
  'flickr',
  'pinterest',
] as const;

const SOCIAL_BASE_URLS: Record<string, string> = {
  insta: 'https://instagram.com/',
  twitter: 'https://twitter.com/',
  linkedin: 'https://linkedin.com/in/',
  github: 'https://github.com/',
  youtube: 'https://youtube.com/',
  tiktok: 'https://tiktok.com/@',
  behance: 'https://behance.net/',
  flickr: 'https://flickr.com/people/',
  pinterest: 'https://pinterest.com/',
};

const DANGEROUS_SCHEMES = /^(javascript|vbscript|data):/i;

/** Mirrors frontend sanitizeUrl */
export function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  return DANGEROUS_SCHEMES.test(trimmed) ? '#' : trimmed;
}

/** Mirrors frontend isValidUrl */
export function isValidUrl(url: string, iconId?: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || DANGEROUS_SCHEMES.test(trimmed)) return false;

  const safeProtocols = ['mailto:', 'tel:', 'whatsapp:', 'sms:'];
  if (safeProtocols.some((p) => trimmed.toLowerCase().startsWith(p)))
    return true;

  if (trimmed.startsWith('@')) {
    return (
      !!iconId && (SUPPORTED_SOCIAL_ICONS as readonly string[]).includes(iconId)
    );
  }

  if (trimmed.startsWith('wa.me/')) return /^wa\.me\/\d+$/.test(trimmed);

  if (/^\+\d+$/.test(trimmed)) return true;

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return true;

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    return parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

/** Mirrors frontend encodeUrlForBackend */
export function encodeUrlForBackend(url: string, iconId?: string): string {
  const trimmed = url.trim();

  if (trimmed.startsWith('@') && iconId && SOCIAL_BASE_URLS[iconId]) {
    return `${SOCIAL_BASE_URLS[iconId]}${trimmed.slice(1)}`;
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return `mailto:${trimmed}`;

  if (/^\+\d+$/.test(trimmed))
    return `https://wa.me/${trimmed.replace('+', '')}`;

  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed))
    return `https://${trimmed}`;

  return trimmed;
}

const REFERRER_HOST_MAP: Record<string, string> = {
  't.co': 'twitter',
  'twitter.com': 'twitter',
  'x.com': 'twitter',
  'linkedin.com': 'linkedin',
  'lnkd.in': 'linkedin',
  'l.facebook.com': 'facebook',
  'facebook.com': 'facebook',
  'lm.facebook.com': 'facebook',
  'wa.me': 'whatsapp',
  'web.whatsapp.com': 'whatsapp',
  'instagram.com': 'instagram',
  'l.instagram.com': 'instagram',
  'google.com': 'google',
  'www.google.com': 'google',
  'tiktok.com': 'tiktok',
  'vm.tiktok.com': 'tiktok',
  'snapchat.com': 'snapchat',
  't.snapchat.com': 'snapchat',
};

/**
 * Best-effort fallback source detection from the Referer header.
 * Unreliable for in-app browsers (notably WhatsApp, which typically
 * strips the referrer entirely) — the `src` query param, set by
 * share-button links, is the primary signal. This is only a fallback
 * for organic/pasted links where no `src` param is present.
 */
export function parseReferrerSource(
  referer: string | undefined,
): string | undefined {
  if (!referer) return undefined;

  try {
    const hostname = new URL(referer).hostname.replace(/^www\./, '');
    return REFERRER_HOST_MAP[hostname];
  } catch {
    return undefined;
  }
}

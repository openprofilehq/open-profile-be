import {
  encodeUrlForBackend,
  isValidUrl,
  sanitizeUrl,
  SUPPORTED_SOCIAL_ICONS,
} from './link.utils';

describe('link.utils', () => {
  describe('sanitizeUrl', () => {
    it('trims safe urls', () => {
      expect(sanitizeUrl('  example.com  ')).toBe('example.com');
    });

    it.each(['javascript:alert(1)', 'vbscript:msgbox(1)', 'data:text/html,x'])(
      'replaces dangerous scheme %s with #',
      (url) => {
        expect(sanitizeUrl(url)).toBe('#');
      },
    );
  });

  describe('isValidUrl', () => {
    it.each(['https://example.com', 'example.com', 'sub.example.co'])(
      'accepts web url %s',
      (url) => {
        expect(isValidUrl(url)).toBe(true);
      },
    );

    it.each([
      'mailto:hello@example.com',
      'tel:+2348012345678',
      'sms:+2348012345678',
    ])('accepts safe protocol %s', (url) => {
      expect(isValidUrl(url)).toBe(true);
    });

    it('accepts a social handle only when a supported icon is provided', () => {
      expect(isValidUrl('@devbyte', 'github')).toBe(true);
      expect(isValidUrl('@devbyte')).toBe(false);
      expect(isValidUrl('@devbyte', 'unknown')).toBe(false);
    });

    it.each(['wa.me/2348012345678', '+2348012345678', 'hello@example.com'])(
      'accepts shorthand contact value %s',
      (url) => {
        expect(isValidUrl(url)).toBe(true);
      },
    );

    it.each(['', '   ', 'javascript:alert(1)', 'not-a-host', '@bad handle'])(
      'rejects invalid url %s',
      (url) => {
        expect(isValidUrl(url)).toBe(false);
      },
    );
  });

  describe('encodeUrlForBackend', () => {
    it('encodes supported social handles to platform urls', () => {
      expect(encodeUrlForBackend('@octocat', 'github')).toBe(
        'https://github.com/octocat',
      );
      expect(encodeUrlForBackend('@creator', 'tiktok')).toBe(
        'https://tiktok.com/@creator',
      );
    });

    it('encodes email and phone shorthand values', () => {
      expect(encodeUrlForBackend('hello@example.com')).toBe(
        'mailto:hello@example.com',
      );
      expect(encodeUrlForBackend('+2348012345678')).toBe(
        'https://wa.me/2348012345678',
      );
    });

    it('preserves existing schemes and adds https to bare domains', () => {
      expect(encodeUrlForBackend('mailto:hello@example.com')).toBe(
        'mailto:hello@example.com',
      );
      expect(encodeUrlForBackend('example.com')).toBe('https://example.com');
    });
  });

  it('keeps the expected supported social icon ids available', () => {
    expect(SUPPORTED_SOCIAL_ICONS).toEqual(
      expect.arrayContaining(['github', 'linkedin', 'twitter', 'tiktok']),
    );
  });
});

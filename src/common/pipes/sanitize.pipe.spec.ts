import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { MAX_DEPTH, SanitizePipe } from './sanitize.pipe';

describe('SanitizePipe', () => {
  let pipe: SanitizePipe;

  const bodyMeta: ArgumentMetadata = { type: 'body' };
  const queryMeta: ArgumentMetadata = { type: 'query' };
  const paramMeta: ArgumentMetadata = { type: 'param' };

  beforeEach(() => {
    pipe = new SanitizePipe();
  });

  describe('HTML and script neutralization', () => {
    it('strips a <script> block including its contents', () => {
      const result = pipe.transform(
        { bio: 'hello <script>alert(1)</script>world' },
        bodyMeta,
      );
      expect(result).toEqual({ bio: 'hello world' });
    });

    it('strips tags carrying event handlers', () => {
      const result = pipe.transform(
        { bio: '<img src=x onerror=alert(1)>photo' },
        bodyMeta,
      );
      expect(result).toEqual({ bio: 'photo' });
    });

    it('strips markup but keeps the surrounding text', () => {
      const result = pipe.transform(
        { bio: 'click <a href="javascript:alert(1)">here</a> now' },
        bodyMeta,
      );
      expect(result).toEqual({ bio: 'click here now' });
    });

    it('strips style blocks and HTML comments', () => {
      const result = pipe.transform(
        { bio: '<style>body{display:none}</style>ok<!-- hidden -->' },
        bodyMeta,
      );
      expect(result).toEqual({ bio: 'ok' });
    });

    it('does not let stripping reconstitute a tag (nested payload)', () => {
      const result = pipe.transform(
        { bio: '<scr<script>ipt>alert(1)</scr</script>ipt>' },
        bodyMeta,
      ) as { bio: string };
      expect(result.bio).not.toContain('<script');
      expect(result.bio).toBe('');
    });

    it('neutralizes the simpler reconstitution form <scr<script>ipt>', () => {
      const result = pipe.transform({ bio: '<scr<script>ipt>' }, bodyMeta) as {
        bio: string;
      };
      expect(result.bio).not.toContain('<script');
      expect(result.bio).not.toContain('<scr');
    });

    it('trims leading and trailing whitespace on plain strings', () => {
      expect(pipe.transform({ name: '  Ada Lovelace  ' }, bodyMeta)).toEqual({
        name: 'Ada Lovelace',
      });
    });
  });

  describe('recursive sanitization', () => {
    it('sanitizes nested objects and arrays', () => {
      const result = pipe.transform(
        {
          profile: {
            bio: '<b>bold</b> text',
            tags: ['<i>one</i>', 'two'],
            links: [{ label: '<script>x</script>GitHub' }],
          },
        },
        bodyMeta,
      );
      expect(result).toEqual({
        profile: {
          bio: 'bold text',
          tags: ['one', 'two'],
          links: [{ label: 'GitHub' }],
        },
      });
    });
  });

  describe('query and route params', () => {
    it('sanitizes query objects', () => {
      const result = pipe.transform(
        { q: '<script>x</script>find me', page: '2' },
        queryMeta,
      );
      expect(result).toEqual({ q: 'find me', page: '2' });
    });

    it('sanitizes null-prototype objects (Express query parsing)', () => {
      const query = Object.create(null) as Record<string, unknown>;
      query.q = '<b>term</b>';
      expect(pipe.transform(query, queryMeta)).toEqual({ q: 'term' });
    });

    it('sanitizes a single route param value', () => {
      const meta: ArgumentMetadata = { type: 'param', data: 'username' };
      expect(pipe.transform('<b>ada</b>', meta)).toBe('ada');
    });

    it('sanitizes the whole params object', () => {
      expect(pipe.transform({ id: '<script>1</script>42' }, paramMeta)).toEqual(
        { id: '42' },
      );
    });
  });

  describe('credential fields pass through byte-for-byte', () => {
    const credential = '  P@ss<b>word</b> & <script>1  ';

    it.each([
      'password',
      'newPassword',
      'currentPassword',
      'confirmPassword',
      'oldPassword',
      'resetToken',
      'refreshToken',
    ])('does not touch %s', (field) => {
      const result = pipe.transform(
        { [field]: credential },
        bodyMeta,
      ) as Record<string, string>;
      expect(result[field]).toBe(credential);
    });

    it('exempts credential fields inside nested objects', () => {
      const result = pipe.transform(
        { auth: { password: credential, note: ' <b>hi</b> ' } },
        bodyMeta,
      );
      expect(result).toEqual({
        auth: { password: credential, note: 'hi' },
      });
    });

    it('exempts a credential bound as a single argument', () => {
      const meta: ArgumentMetadata = { type: 'body', data: 'refreshToken' };
      expect(pipe.transform(credential, meta)).toBe(credential);
    });
  });

  describe('legitimate input is not corrupted', () => {
    it.each([
      ['email', 'user.name+tag@example.com'],
      ['url', 'https://example.com/path?a=1&b=2&redirect=https%3A%2F%2Fx.com'],
      ['handle', '@kelechi_uba'],
      ['username', 'kelechi.uba-001_dev'],
      ['otp', '483920'],
      ['comparison', '1 < 2 && 4 > 3'],
      ['prose', 'Terms & Conditions apply'],
    ])('leaves a legitimate %s unchanged', (field, value) => {
      const result = pipe.transform({ [field]: value }, bodyMeta) as Record<
        string,
        string
      >;
      expect(result[field]).toBe(value);
    });
  });

  describe('non-string values pass through untouched', () => {
    it('leaves numbers, booleans and null as-is', () => {
      const body = { age: 30, active: true, score: null };
      expect(pipe.transform(body, bodyMeta)).toEqual(body);
    });

    it('leaves non-plain objects (e.g. Date) by reference', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const result = pipe.transform({ createdAt }, bodyMeta) as {
        createdAt: Date;
      };
      expect(result.createdAt).toBe(createdAt);
    });

    it('ignores custom-decorator arguments entirely', () => {
      const user = { name: '<b>keep</b>' };
      expect(pipe.transform(user, { type: 'custom' })).toBe(user);
    });
  });

  describe('depth cap fails closed', () => {
    // nest(3, x) => { child: { child: { leaf: x } } }
    const nest = (levels: number, leaf: unknown): Record<string, unknown> => {
      let current: Record<string, unknown> = { leaf };
      for (let i = 1; i < levels; i++) {
        current = { child: current };
      }
      return current;
    };

    it('rejects a payload nested deeper than the cap', () => {
      const payload = nest(MAX_DEPTH + 1, '<script>alert(1)</script>');
      expect(() => pipe.transform(payload, bodyMeta)).toThrow(
        BadRequestException,
      );
    });

    it('still fully sanitizes a payload just inside the cap', () => {
      const payload = nest(MAX_DEPTH, '<script>alert(1)</script>safe');
      let node = pipe.transform(payload, bodyMeta) as Record<string, unknown>;
      for (let i = 1; i < MAX_DEPTH; i++) {
        node = node.child as Record<string, unknown>;
      }
      expect(node.leaf).toBe('safe');
    });

    it('rejects an over-deep container under an exempt key', () => {
      const payload = { password: nest(MAX_DEPTH + 1, 'x') };
      expect(() => pipe.transform(payload, bodyMeta)).toThrow(
        BadRequestException,
      );
    });

    it('rejects an over-deep exempt single-argument value', () => {
      const meta: ArgumentMetadata = { type: 'body', data: 'password' };
      expect(() => pipe.transform(nest(MAX_DEPTH + 1, 'x'), meta)).toThrow(
        BadRequestException,
      );
    });

    it('leaves a shallow structure under an exempt key unmutated', () => {
      const inner = ' <b>x</b> ';
      const result = pipe.transform({ password: { inner } }, bodyMeta) as {
        password: { inner: string };
      };
      expect(result.password.inner).toBe(inner);
    });
  });

  describe('prototype pollution safety', () => {
    it('drops __proto__, constructor and prototype keys', () => {
      const payload = JSON.parse(
        '{"name":"a","__proto__":{"polluted":true},"constructor":{"x":1},"prototype":{"y":2}}',
      ) as Record<string, unknown>;
      const result = pipe.transform(payload, bodyMeta) as Record<
        string,
        unknown
      >;

      expect(Object.keys(result)).toEqual(['name']);
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  });
});

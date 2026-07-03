import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

const SANITIZED_TYPES = new Set<ArgumentMetadata['type']>([
  'body',
  'query',
  'param',
]);

// Credential values must reach services byte-for-byte: trimming or stripping
// a password or opaque token corrupts it and locks the user out.
// Exemption matches by key name at any depth, so a future non-credential
// field literally named e.g. `password` would silently skip string
// sanitization (the depth cap still applies to exempt values).
const EXEMPT_FIELDS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'oldpassword',
  'resettoken',
  'refreshtoken',
]);

// Never copied when rebuilding objects, so a payload like
// {"__proto__": {...}} cannot pollute prototypes downstream.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const MAX_DEPTH = 100;

const MAX_STRIP_PASSES = 10;

const SCRIPT_STYLE_BLOCK = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const HTML_TAG = /<\/?[a-z!][^>]*>/gi;

/**
 * Strips HTML/script content from all user-supplied strings (body, query,
 * route params) before validation runs. Tags are stripped rather than
 * entity-escaped because URL fields (projectUrl, photoUrl, repoUrl, ...)
 * legitimately contain `&` and `?`, which escaping would corrupt.
 */
@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (!SANITIZED_TYPES.has(metadata.type)) return value;
    if (metadata.data && EXEMPT_FIELDS.has(metadata.data.toLowerCase())) {
      return this.assertStructureWithinDepth(value, 0);
    }
    return this.sanitize(value, 0);
  }

  private sanitize(value: unknown, depth: number): unknown {
    if (typeof value === 'string') return this.sanitizeString(value);
    if (Array.isArray(value)) {
      this.assertWithinDepth(depth);
      return value.map((item) => this.sanitize(item, depth + 1));
    }
    if (this.isPlainObject(value)) {
      this.assertWithinDepth(depth);
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        if (UNSAFE_KEYS.has(key)) continue;
        result[key] = EXEMPT_FIELDS.has(key.toLowerCase())
          ? this.assertStructureWithinDepth(value[key], depth + 1)
          : this.sanitize(value[key], depth + 1);
      }
      return result;
    }
    return value;
  }

  // Fail closed: a container past the cap would otherwise pass through
  // untraversed and smuggle unsanitized strings into application logic.
  private assertWithinDepth(depth: number): void {
    if (depth >= MAX_DEPTH) {
      throw new BadRequestException('Payload nesting too deep');
    }
  }

  // Exempt values skip string mutation, not the depth cap: walk their
  // containers depth-checking only and return the value untouched, so an
  // over-deep structure can't ride an exempt key past the cap.
  private assertStructureWithinDepth(value: unknown, depth: number): unknown {
    if (Array.isArray(value)) {
      this.assertWithinDepth(depth);
      for (const item of value) {
        this.assertStructureWithinDepth(item, depth + 1);
      }
    } else if (this.isPlainObject(value)) {
      this.assertWithinDepth(depth);
      for (const key of Object.keys(value)) {
        this.assertStructureWithinDepth(value[key], depth + 1);
      }
    }
    return value;
  }

  private sanitizeString(value: string): string {
    let current = value;
    // Single-pass stripping is bypassable: removing <script> from
    // <scr<script>ipt> reconstitutes <script>. Re-strip until stable.
    for (let pass = 0; pass < MAX_STRIP_PASSES; pass++) {
      const stripped = current
        .replace(SCRIPT_STYLE_BLOCK, '')
        .replace(HTML_COMMENT, '')
        .replace(HTML_TAG, '');
      if (stripped === current) return stripped.trim();
      current = stripped;
    }
    // Still unstable after the pass cap (pathological nesting): drop the
    // remaining angle brackets so no tag can survive.
    return current.replace(/[<>]/g, '').trim();
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object') return false;
    const proto: unknown = Object.getPrototypeOf(value);
    // Express query objects are created with Object.create(null).
    return proto === Object.prototype || proto === null;
  }
}

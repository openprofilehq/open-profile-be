import { QueryFailedError } from 'typeorm';
import { isRetryableError } from './is-retryable-error.util';

/**
 * Builds a fake QueryFailedError with the given Postgres error code,
 * matching the shape isRetryableError actually reads (driverError.code).
 * We don't need a real DB connection to test the classification logic —
 * only the error shape matters.
 */
function makeQueryFailedError(code: string | undefined): QueryFailedError {
  const err = new QueryFailedError('SELECT 1', [], new Error('fake db error'));
  (err as unknown as { driverError: { code?: string } }).driverError = { code };
  return err;
}

describe('isRetryableError', () => {
  describe('retryable Postgres codes', () => {
    const retryableCodes = ['40001', '40P01', '08006', '08001', '57P03'];

    it.each(retryableCodes)('returns true for code %s', (code) => {
      const err = makeQueryFailedError(code);
      expect(isRetryableError(err)).toBe(true);
    });
  });

  describe('non-retryable Postgres codes', () => {
    const nonRetryableCodes = ['23505', '23502', '23503'];

    it.each(nonRetryableCodes)('returns false for code %s', (code) => {
      const err = makeQueryFailedError(code);
      expect(isRetryableError(err)).toBe(false);
    });
  });

  it('returns false for an unrecognized Postgres code', () => {
    const err = makeQueryFailedError('99999');
    expect(isRetryableError(err)).toBe(false);
  });

  it('returns false when driverError has no code at all', () => {
    const err = makeQueryFailedError(undefined);
    expect(isRetryableError(err)).toBe(false);
  });

  describe('connection-level errors (not QueryFailedError)', () => {
    it('returns true for a timeout message', () => {
      const err = new Error('Query read timeout');
      expect(isRetryableError(err)).toBe(true);
    });

    it('returns true for ECONNREFUSED', () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:5432');
      expect(isRetryableError(err)).toBe(true);
    });

    it('returns true for "connection terminated"', () => {
      const err = new Error('Connection terminated unexpectedly');
      expect(isRetryableError(err)).toBe(true);
    });

    it('returns true for "connection reset"', () => {
      const err = new Error('read ECONNRESET connection reset by peer');
      expect(isRetryableError(err)).toBe(true);
    });

    it('returns false for an unrelated error message', () => {
      const err = new Error('Something completely unrelated happened');
      expect(isRetryableError(err)).toBe(false);
    });
  });

  it('returns false for a non-Error, non-QueryFailedError thrown value', () => {
    expect(isRetryableError('a plain string was thrown')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

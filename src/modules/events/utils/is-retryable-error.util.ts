import { QueryFailedError } from 'typeorm';

/**
 * isRetryableError
 * -----------------
 * Retryable (transient):
 *   40001  serialization_failure
 *   40P01  deadlock_detected
 *   08006  connection_failure
 *   08001  sqlclient_unable_to_establish_sqlconnection
 *   57P03  cannot_connect_now
 *
 * Non-retryable (permanent):
 *   23505  unique_violation
 *   23502  not_null_violation
 *   23503  foreign_key_violation
 *
 * Unknown codes default to NON-retryable — an unrecognized error is more
 * likely a bug than a transient blip, so we fail fast instead of retrying
 * blind.
 */

const RETRYABLE_CODES = new Set(['40001', '40P01', '08006', '08001', '57P03']);

const NON_RETRYABLE_CODES = new Set(['23505', '23502', '23503']);

export function isRetryableError(err: unknown): boolean {
  if (err instanceof QueryFailedError) {
    const code = (err as unknown as { driverError?: { code?: string } })
      .driverError?.code;

    if (code && RETRYABLE_CODES.has(code)) return true;
    if (code && NON_RETRYABLE_CODES.has(code)) return false;

    return false;
  }

  if (err instanceof Error) {
    const message = err.message?.toLowerCase() ?? '';
    if (
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('connection terminated') ||
      message.includes('connection reset')
    ) {
      return true;
    }
  }

  return false;
}

import { Logger } from '@nestjs/common';
import { isRetryableError } from './is-retryable-error.util';

export interface RetryConfig {
  maxRetries: number;
  /** Base delay in ms for each retry attempt, in order. */
  delaysMs: number[];
  /** Max jitter in ms, applied as +/- to each delay. */
  jitterMs: number;
}

// 3 attempts, 100ms -> 200ms -> 400ms, +/-20ms jitter.
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  delaysMs: [100, 200, 400],
  jitterMs: 20,
};

function delayWithJitter(baseMs: number, jitterMs: number): number {
  const jitter = Math.floor(Math.random() * (jitterMs * 2 + 1)) - jitterMs;
  return Math.max(0, baseMs + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const logger = new Logger('EventRetry');

/**
 * Runs `writeFn` with retry-on-transient-failure.
 * Calls `onExhausted` on a non-retryable error (immediately) or once
 * retries are exhausted — never throws.
 */
export async function writeEventWithRetry<T>(
  writeFn: () => Promise<T>,
  onExhausted: (err: unknown, attempts: number) => Promise<void>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<void> {
  let attempt = 0; // 0 = first attempt, not yet a "retry"

  while (true) {
    try {
      await writeFn();
      if (attempt > 0) {
        logger.log(`Event write succeeded on retry attempt ${attempt}`);
      }
      return;
    } catch (err) {
      if (!isRetryableError(err)) {
        logger.error(
          `Non-retryable error, dead-lettering immediately: ${(err as Error)?.message}`,
        );
        await onExhausted(err, attempt + 1);
        return;
      }

      if (attempt >= config.maxRetries) {
        logger.error(
          `Event write failed after ${attempt + 1} attempt(s), dead-lettering: ${
            (err as Error)?.message
          }`,
        );
        await onExhausted(err, attempt + 1);
        return;
      }

      const baseDelay =
        config.delaysMs[attempt] ?? config.delaysMs[config.delaysMs.length - 1];
      const delay = delayWithJitter(baseDelay, config.jitterMs);

      logger.warn(
        `Retryable error on attempt ${attempt + 1}/${config.maxRetries}, retrying in ${delay}ms: ${
          (err as Error)?.message
        }`,
      );

      await sleep(delay);
      attempt += 1;
    }
  }
}

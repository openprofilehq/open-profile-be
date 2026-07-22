import { Logger } from '@nestjs/common';
import { isRetryableError } from './is-retryable-error.util';

export interface RetryConfig {
  maxRetries: number;
  delaysMs: number[];
  jitterMs: number;
}

// 3 retries after the initial attempt (4 total attempts), 100ms -> 200ms -> 400ms, +/-20ms jitter.
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  delaysMs: [100, 200, 400],
  jitterMs: 20,
};

function delayWithJitter(baseMs: number, jitterMs: number): number {
  const jitter = Math.floor(Math.random() * (jitterMs * 2 + 1)) - jitterMs;
  return Math.max(0, baseMs + jitter);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const logger = new Logger('EventRetry');

/**
 * Calls onExhausted, guarding against it throwing. onExhausted is the last
 * line of defense for a failed event write (e.g. persisting to a
 * dead-letter table) — if THAT fails too, we cannot recover the event, but
 * we must not let the failure escape and break writeEventWithRetry's
 * "never throws" guarantee. Best we can do at that point is log it clearly
 * so the loss is visible rather than silent or crash-inducing.
 */
async function safeOnExhausted(
  onExhausted: (err: unknown, attempts: number) => Promise<void>,
  err: unknown,
  attempts: number,
): Promise<void> {
  try {
    await onExhausted(err, attempts);
  } catch (deadLetterErr) {
    logger.error(
      `Dead-letter handler failed, event permanently lost: ${
        (deadLetterErr as Error)?.message
      }`,
      { originalError: (err as Error)?.message },
    );
  }
}

export async function writeEventWithRetry<T>(
  writeFn: () => Promise<T>,
  onExhausted: (err: unknown, attempts: number) => Promise<void>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<void> {
  let attempt = 0;

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
        await safeOnExhausted(onExhausted, err, attempt + 1);
        return;
      }

      if (attempt >= config.maxRetries) {
        logger.error(
          `Event write failed after ${attempt + 1} attempt(s), dead-lettering: ${
            (err as Error)?.message
          }`,
        );
        await safeOnExhausted(onExhausted, err, attempt + 1);
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

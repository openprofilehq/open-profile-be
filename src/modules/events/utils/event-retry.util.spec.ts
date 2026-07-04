import { writeEventWithRetry, DEFAULT_RETRY_CONFIG } from './event-retry.util';

describe('writeEventWithRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Helper: a retryable error, shaped so isRetryableError recognizes it via
  // the timeout-message path (simpler to construct than a full QueryFailedError
  // with a fake driverError — either works, this is just less boilerplate).
  function retryableError(): Error {
    return new Error('Query read timeout');
  }

  function nonRetryableError(): Error {
    return new Error('duplicate key value violates unique constraint');
  }

  it('succeeds on the first attempt without calling onExhausted', async () => {
    const writeFn = jest.fn().mockResolvedValue(undefined);
    const onExhausted = jest.fn();

    await writeEventWithRetry(writeFn, onExhausted);

    expect(writeFn).toHaveBeenCalledTimes(1);
    expect(onExhausted).not.toHaveBeenCalled();
  });

  it('retries once on a transient failure, then succeeds', async () => {
    const writeFn = jest
      .fn()
      .mockRejectedValueOnce(retryableError())
      .mockResolvedValueOnce(undefined);
    const onExhausted = jest.fn();

    const resultPromise = writeEventWithRetry(writeFn, onExhausted);

    // First attempt has already failed by now; advance past the first
    // backoff delay (100ms base + up to 20ms jitter) so the retry fires.
    await jest.advanceTimersByTimeAsync(
      DEFAULT_RETRY_CONFIG.delaysMs[0] + DEFAULT_RETRY_CONFIG.jitterMs,
    );
    await resultPromise;

    expect(writeFn).toHaveBeenCalledTimes(2);
    expect(onExhausted).not.toHaveBeenCalled();
  });

  it('exhausts all retries on a persistent transient failure and dead-letters', async () => {
    const writeFn = jest.fn().mockRejectedValue(retryableError());
    const onExhausted = jest.fn().mockResolvedValue(undefined);

    const resultPromise = writeEventWithRetry(writeFn, onExhausted);

    // 3 retries means 3 delays to advance past: 100, 200, 400ms (+ jitter margin each)
    for (const baseDelay of DEFAULT_RETRY_CONFIG.delaysMs) {
      await jest.advanceTimersByTimeAsync(
        baseDelay + DEFAULT_RETRY_CONFIG.jitterMs,
      );
    }
    await resultPromise;

    // 1 initial attempt + 3 retries = 4 total calls
    expect(writeFn).toHaveBeenCalledTimes(DEFAULT_RETRY_CONFIG.maxRetries + 1);
    expect(onExhausted).toHaveBeenCalledTimes(1);
    expect(onExhausted).toHaveBeenCalledWith(
      expect.any(Error),
      DEFAULT_RETRY_CONFIG.maxRetries + 1,
    );
  });

  it('dead-letters immediately on a non-retryable error, with no delay', async () => {
    const writeFn = jest.fn().mockRejectedValue(nonRetryableError());
    const onExhausted = jest.fn().mockResolvedValue(undefined);

    await writeEventWithRetry(writeFn, onExhausted);

    // No advanceTimersByTimeAsync needed at all — if this resolves without
    // it, that proves no delay was scheduled before dead-lettering.
    expect(writeFn).toHaveBeenCalledTimes(1);
    expect(onExhausted).toHaveBeenCalledTimes(1);
    expect(onExhausted).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  it('waits before retrying rather than retrying instantly', async () => {
    const writeFn = jest
      .fn()
      .mockRejectedValueOnce(retryableError())
      .mockResolvedValueOnce(undefined);
    const onExhausted = jest.fn();

    const resultPromise = writeEventWithRetry(writeFn, onExhausted);

    // Give pending microtasks a chance to run, but do NOT advance the
    // fake clock at all. If the retry fired without waiting, writeFn
    // would already show 2 calls here — it should still show only 1.
    await Promise.resolve();
    await Promise.resolve();
    expect(writeFn).toHaveBeenCalledTimes(1);

    // Now advance past the delay and confirm the retry actually happens.
    await jest.advanceTimersByTimeAsync(
      DEFAULT_RETRY_CONFIG.delaysMs[0] + DEFAULT_RETRY_CONFIG.jitterMs,
    );
    await resultPromise;
    expect(writeFn).toHaveBeenCalledTimes(2);
  });
});

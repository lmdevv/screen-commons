export interface RetryOptions {
  fetch?: typeof fetch;
  /** Total tries per request, including the first. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** A longer `Retry-After` than this goes back to the caller rather than being slept through. */
  maxRetryAfterMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
/** Answers that mean the server did no work, so even a DELETE can safely go again. */
const REFUSED_STATUS = new Set([429, 503]);

/** `Retry-After` in milliseconds: delta-seconds or an HTTP date. */
export function retryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/**
 * A `fetch` that retries transient failures with bounded exponential backoff, honouring
 * `Retry-After`. It is only safe around writes that converge on retry. Screen uploads dedupe on
 * their bytes and every flow create carries a client-chosen id; a DELETE that may have landed is
 * not retried, since its retry would report a false `not_found`.
 */
export function retryingFetch(options: RetryOptions = {}): typeof fetch {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const attempts = options.attempts ?? 5;
  const baseDelay = options.baseDelayMs ?? 1000;
  const maxDelay = options.maxDelayMs ?? 30_000;
  const maxRetryAfter = options.maxRetryAfterMs ?? 120_000;
  const timeout = options.timeoutMs ?? 180_000;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));

  return async (input, init) => {
    const canRepeatLanded = (init?.method ?? "GET").toUpperCase() !== "DELETE";
    for (let attempt = 1; ; attempt += 1) {
      const backoff = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1));
      try {
        const response = await doFetch(input, {
          ...init,
          signal: init?.signal ?? AbortSignal.timeout(timeout),
        });
        const retryable = canRepeatLanded
          ? RETRYABLE_STATUS.has(response.status)
          : REFUSED_STATUS.has(response.status);
        if (!retryable || attempt >= attempts) return response;
        const after = retryAfterMs(response.headers.get("retry-after"));
        if (after !== null && after > maxRetryAfter) return response;
        await response.body?.cancel().catch(() => undefined);
        await sleep(after ?? backoff);
      } catch (error) {
        if (!canRepeatLanded || attempt >= attempts) throw error;
        await sleep(backoff);
      }
    }
  };
}

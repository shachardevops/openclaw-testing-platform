/**
 * Ruflo Retry — exponential backoff for retryable operations.
 */

/**
 * Wrap an async function with retry logic.
 * Only retries errors with `isRetryable === true`.
 *
 * @param {Function} fn - Async function to retry
 * @param {Object} opts
 * @param {number} opts.maxAttempts - Max total attempts (default 3)
 * @param {number} opts.baseDelayMs - Base delay in ms (default 1000)
 * @param {Function} opts.onRetry - Optional callback(error, attempt)
 * @returns {Promise<*>}
 */
export async function withRetry(fn, { maxAttempts = 3, baseDelayMs = 1000, onRetry } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (!error.isRetryable || attempt >= maxAttempts) {
        throw error;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      if (onRetry) onRetry(error, attempt);

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

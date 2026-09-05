/** 网络同步失败时使用有限次数的退避重试，避免把瞬态连接错误直接暴露给用户。 */
export interface RetryOptions {
  delays?: number[];
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, delay: number, error: unknown) => void;
  shouldRetry?: (error: unknown) => boolean;
}

const DEFAULT_DELAYS = [1000, 3000];
const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function isRetryableNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ERR_CONNECTION_(?:CLOSED|RESET|REFUSED)|ECONN(?:RESET|REFUSED|ABORTED)|ETIMEDOUT|ENOTFOUND|network|fetch failed|failed to fetch|timeout/i.test(
    message,
  );
}

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const delays = options.delays ?? DEFAULT_DELAYS;
  const sleep = options.sleep ?? realSleep;
  const shouldRetry = options.shouldRetry ?? isRetryableNetworkError;
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= delays.length || !shouldRetry(error)) throw error;
      const delay = delays[attempt++];
      options.onRetry?.(attempt, delay, error);
      await sleep(delay);
    }
  }
}

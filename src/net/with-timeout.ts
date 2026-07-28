/**
 * Reject with `message` if `promise` has not settled within `ms`.
 *
 * Obsidian's requestUrl takes no timeout, so a stalled CalDAV request would
 * otherwise leave the whole sync awaiting a promise that never settles —
 * invisible to try/catch and to the user.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

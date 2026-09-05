import { describe, expect, it } from "vitest";
import { isRetryableNetworkError, withRetry } from "../../src/sync/retry";

describe("sync retry", () => {
  it("retries transient connection failures with injected delays", async () => {
    let calls = 0;
    const attempts: number[] = [];
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("net::ERR_CONNECTION_CLOSED");
        return "ok";
      },
      { delays: [10, 20], sleep: async (ms) => attempts.push(ms) },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(attempts).toEqual([10, 20]);
  });

  it("does not retry authentication or validation errors", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("HTTP 401");
        },
        { delays: [0], sleep: async () => {} },
      ),
    ).rejects.toThrow("HTTP 401");
    expect(calls).toBe(1);
    expect(isRetryableNetworkError(new Error("HTTP 401"))).toBe(false);
  });
});

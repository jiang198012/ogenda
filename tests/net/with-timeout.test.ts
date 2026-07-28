import { describe, it, expect, vi, afterEach } from "vitest";
import { withTimeout } from "../../src/net/with-timeout";

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("resolves with the value when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1000, "too slow")).resolves.toBe("ok");
  });

  it("rejects with the given message when the promise never settles", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<string>(() => {}), 30_000, "too slow");
    const assertion = expect(pending).rejects.toThrow("too slow");
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it("propagates the original rejection rather than the timeout message", async () => {
    await expect(withTimeout(Promise.reject(new Error("HTTP 401")), 1000, "too slow")).rejects.toThrow("HTTP 401");
  });

  it("clears the timer once the promise settles, leaving nothing pending", async () => {
    vi.useFakeTimers();
    await withTimeout(Promise.resolve("ok"), 30_000, "too slow");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timer when the promise rejects", async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.reject(new Error("nope")), 30_000, "too slow")).rejects.toThrow("nope");
    expect(vi.getTimerCount()).toBe(0);
  });
});

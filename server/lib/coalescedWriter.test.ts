import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoalescedWriter } from "./coalescedWriter";

describe("createCoalescedWriter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("collapses a burst for one key into a single trailing write with the latest value", () => {
    const writer = vi.fn();
    const cw = createCoalescedWriter<number>(writer, 3000);

    cw.schedule("room:a", 1);
    cw.schedule("room:a", 2);
    cw.schedule("room:a", 5);

    expect(writer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);

    expect(writer).toHaveBeenCalledTimes(1);
    expect(writer).toHaveBeenCalledWith("room:a", 5);
  });

  it("keeps writes for different keys independent", () => {
    const writer = vi.fn();
    const cw = createCoalescedWriter<number>(writer, 1000);

    cw.schedule("room:a", 10);
    cw.schedule("room:b", 20);
    expect(cw.pendingCount()).toBe(2);

    vi.advanceTimersByTime(1000);
    expect(writer).toHaveBeenCalledTimes(2);
    expect(writer).toHaveBeenCalledWith("room:a", 10);
    expect(writer).toHaveBeenCalledWith("room:b", 20);
    expect(cw.pendingCount()).toBe(0);
  });

  it("flush writes the pending value immediately and cancels the timer", () => {
    const writer = vi.fn();
    const cw = createCoalescedWriter<number>(writer, 5000);

    cw.schedule("room:a", 7);
    cw.flush("room:a");

    expect(writer).toHaveBeenCalledTimes(1);
    expect(writer).toHaveBeenCalledWith("room:a", 7);

    // Timer must not fire a duplicate write after a flush.
    vi.advanceTimersByTime(5000);
    expect(writer).toHaveBeenCalledTimes(1);
    expect(cw.pendingCount()).toBe(0);
  });

  it("flush on a key with nothing pending is a no-op", () => {
    const writer = vi.fn();
    const cw = createCoalescedWriter<number>(writer, 1000);
    cw.flush("room:none");
    expect(writer).not.toHaveBeenCalled();
  });

  it("allows a new write to be scheduled after the previous one fired", () => {
    const writer = vi.fn();
    const cw = createCoalescedWriter<number>(writer, 1000);

    cw.schedule("room:a", 1);
    vi.advanceTimersByTime(1000);
    cw.schedule("room:a", 2);
    vi.advanceTimersByTime(1000);

    expect(writer).toHaveBeenCalledTimes(2);
    expect(writer).toHaveBeenNthCalledWith(1, "room:a", 1);
    expect(writer).toHaveBeenNthCalledWith(2, "room:a", 2);
  });
});

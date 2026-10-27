import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveNoteError } from "../db/notes";
import { useAutosave } from "./useAutosave";

const snapshot = { title: "Draft", bodyHtml: "<p>Hello</p>" };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAutosave", () => {
  it("debounces a change before saving", async () => {
    const save = vi.fn().mockResolvedValue(2);
    const { result } = renderHook(() =>
      useAutosave({ initialVersion: 1, save })
    );

    act(() => result.current.change(snapshot));
    expect(result.current.state.status).toBe("dirty");
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(799);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledWith(snapshot);
    expect(result.current.state.status).toBe("saved");
    expect(result.current.state.version).toBe(2);
  });

  it("queues a second save when content changes mid-flight", async () => {
    let resolveFirst: ((version: number) => void) | null = null;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce(3);

    const { result } = renderHook(() =>
      useAutosave({ initialVersion: 1, save })
    );

    act(() => result.current.change(snapshot));
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);

    const newer = { title: "Newer", bodyHtml: "<p>Newer</p>" };
    act(() => result.current.change(newer));

    await act(async () => {
      resolveFirst?.(2);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(newer);
    expect(result.current.state.version).toBe(3);
  });

  it("keeps the draft and reports a conflict", async () => {
    const save = vi
      .fn()
      .mockRejectedValue(new SaveNoteError("conflict", "changed elsewhere"));
    const { result } = renderHook(() =>
      useAutosave({ initialVersion: 1, save })
    );

    act(() => result.current.change(snapshot));
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.state.status).toBe("conflict");
    expect(result.current.dirty).toBe(true);
  });

  it("retries after a failed save", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(2);
    const { result } = renderHook(() =>
      useAutosave({ initialVersion: 1, save })
    );

    act(() => result.current.change(snapshot));
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.state.status).toBe("error");

    await act(async () => {
      result.current.retry();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.state.status).toBe("saved");
  });

  it("marks recovered drafts dirty and saves them", async () => {
    const save = vi.fn().mockResolvedValue(2);
    const { result } = renderHook(() =>
      useAutosave({ initialVersion: 1, save })
    );

    act(() => result.current.recover(snapshot));
    expect(result.current.state.status).toBe("dirty");

    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledWith(snapshot);
  });

  it("resets to a server version", () => {
    const save = vi.fn().mockResolvedValue(2);
    const { result } = renderHook(() =>
      useAutosave({ initialVersion: 1, save })
    );

    act(() => result.current.change(snapshot));
    act(() => result.current.reset(7));

    expect(result.current.state.status).toBe("idle");
    expect(result.current.state.version).toBe(7);
    expect(result.current.dirty).toBe(false);
  });
});

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

  it("skips the request when the content ends unchanged", async () => {
    const save = vi.fn().mockResolvedValue(2);
    const onUnchanged = vi.fn();
    const onSaved = vi.fn();
    const { result } = renderHook(() =>
      useAutosave({ initialVersion: 5, save, onUnchanged, onSaved })
    );

    act(() => result.current.reset(5, snapshot));
    act(() => result.current.change(snapshot));

    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(save).not.toHaveBeenCalled();
    expect(onUnchanged).toHaveBeenCalledOnce();
    // Nothing changed on the server, so the note list must not refetch either.
    expect(onSaved).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe("saved");
    expect(result.current.state.version).toBe(5);
    expect(result.current.dirty).toBe(false);
  });

  it("saves as usual when the content differs from the baseline", async () => {
    const save = vi.fn().mockResolvedValue(6);
    const { result } = renderHook(() =>
      useAutosave({ initialVersion: 5, save })
    );

    act(() => result.current.reset(5, snapshot));
    act(() =>
      result.current.change({ title: "Draft", bodyHtml: "<p>Edited</p>" })
    );

    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledOnce();
    expect(result.current.state.version).toBe(6);
  });

  it("never skips while a conflict is unresolved", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new SaveNoteError("conflict", "changed elsewhere"))
      .mockResolvedValueOnce(7);
    const { result } = renderHook(() =>
      useAutosave({ initialVersion: 5, save })
    );

    act(() => result.current.reset(5, snapshot));
    act(() =>
      result.current.change({ title: "Draft", bodyHtml: "<p>Edited</p>" })
    );
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.state.status).toBe("conflict");

    // Reverting to the baseline must still write: the server moved on.
    act(() => result.current.change(snapshot));
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.state.status).toBe("saved");
  });

  it("treats content saved in this session as the new no-op baseline", async () => {
    const save = vi.fn().mockResolvedValue(6);
    const onUnchanged = vi.fn();
    const { result } = renderHook(() =>
      useAutosave({ initialVersion: 5, save, onUnchanged })
    );

    act(() => result.current.reset(5, snapshot));
    const edited = { title: "Draft", bodyHtml: "<p>Edited</p>" };
    act(() => result.current.change(edited));
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledOnce();

    // An identical repeat of what was just written needs no request…
    act(() => result.current.change(edited));
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledOnce();
    expect(onUnchanged).toHaveBeenCalledOnce();

    // …but content that differs from it must still go to the server.
    act(() => result.current.change(snapshot));
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(snapshot);
  });

  it("saves everything after a reset without a baseline", async () => {
    const save = vi.fn().mockResolvedValue(2);
    const { result } = renderHook(() =>
      useAutosave({ initialVersion: 1, save })
    );

    act(() => result.current.reset(1));
    act(() => result.current.change(snapshot));

    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledOnce();
  });
});

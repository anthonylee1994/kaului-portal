import React from "react";
import {act, render} from "@testing-library/react";
import {usePolling, type PollSource} from "./usePolling";

function setHidden(hidden: boolean) {
    Object.defineProperty(document, "hidden", {configurable: true, get: () => hidden});
    document.dispatchEvent(new Event("visibilitychange"));
}

let trigger: () => Promise<void>;

const Probe = ({task, enabled = true}: {task: (source: PollSource) => Promise<void>; enabled?: boolean}) => {
    trigger = usePolling(task, {intervalMs: 15_000, enabled}).trigger;
    return null;
};

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    setHidden(false);
    vi.useRealTimers();
});

describe("usePolling", () => {
    it("runs on mount, then every interval", async () => {
        const task = vi.fn(async () => {});
        render(<Probe task={task} />);
        expect(task).toHaveBeenCalledTimes(1);
        await act(() => vi.advanceTimersByTimeAsync(15_000));
        expect(task).toHaveBeenCalledTimes(2);
        await act(() => vi.advanceTimersByTimeAsync(15_000));
        expect(task).toHaveBeenCalledTimes(3);
    });

    it("skips ticks and manual triggers while a run is in flight", async () => {
        let finish!: () => void;
        const task = vi.fn(() => new Promise<void>(resolve => (finish = resolve)));
        render(<Probe task={task} />);
        await act(() => vi.advanceTimersByTimeAsync(45_000));
        void trigger();
        expect(task).toHaveBeenCalledTimes(1);
        await act(async () => finish());
        await act(() => vi.advanceTimersByTimeAsync(15_000));
        expect(task).toHaveBeenCalledTimes(2);
    });

    it("tells the task whether a run was manual", async () => {
        const task = vi.fn(async () => {});
        render(<Probe task={task} />);
        await act(() => vi.advanceTimersByTimeAsync(0));
        await act(() => trigger());
        expect(task.mock.calls.map(call => call[0])).toEqual(["poll", "manual"]);
    });

    it("sends nothing while hidden, refetches at once on return and resumes the cycle", async () => {
        const task = vi.fn(async () => {});
        render(<Probe task={task} />);
        act(() => setHidden(true));
        await act(() => vi.advanceTimersByTimeAsync(60_000));
        expect(task).toHaveBeenCalledTimes(1);
        await act(async () => setHidden(false));
        expect(task).toHaveBeenCalledTimes(2);
        await act(() => vi.advanceTimersByTimeAsync(15_000));
        expect(task).toHaveBeenCalledTimes(3);
    });

    it("stops when disabled", async () => {
        const task = vi.fn(async () => {});
        const view = render(<Probe task={task} />);
        view.rerender(<Probe task={task} enabled={false} />);
        await act(() => vi.advanceTimersByTimeAsync(60_000));
        expect(task).toHaveBeenCalledTimes(1);
    });

    it("clears the timer and the listener on unmount", async () => {
        const task = vi.fn(async () => {});
        const view = render(<Probe task={task} />);
        view.unmount();
        await act(() => vi.advanceTimersByTimeAsync(60_000));
        act(() => setHidden(false));
        expect(task).toHaveBeenCalledTimes(1);
    });

    it("does not restart the timer when the task identity changes", async () => {
        const first = vi.fn(async () => {});
        const second = vi.fn(async () => {});
        const view = render(<Probe task={first} />);
        await act(() => vi.advanceTimersByTimeAsync(10_000));
        view.rerender(<Probe task={second} />);
        await act(() => vi.advanceTimersByTimeAsync(5_000));
        expect(second).toHaveBeenCalledTimes(1);
        expect(first).toHaveBeenCalledTimes(1);
    });
});

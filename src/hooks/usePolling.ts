import React from "react";

export type PollSource = "poll" | "manual";

// `task` receives where the run came from, so callers can treat manual runs differently (e.g. ignore a 429 pause).
export function usePolling(task: (source: PollSource) => Promise<void>, options: {intervalMs: number; enabled: boolean}): {trigger: () => Promise<void>} {
    const {intervalMs, enabled} = options;
    // The latest task lives in a ref so a new closure never restarts the timer.
    const taskRef = React.useRef(task);
    taskRef.current = task;
    const inFlight = React.useRef<Promise<void> | null>(null);

    // Overlapping runs are not queued: while one is in flight, a tick or a manual trigger gets the same promise back.
    const run = (source: PollSource): Promise<void> => {
        if (inFlight.current) return inFlight.current;
        const promise = (async () => {
            try {
                await taskRef.current(source);
            } finally {
                inFlight.current = null;
            }
        })();
        inFlight.current = promise;
        return promise;
    };

    React.useEffect(() => {
        if (!enabled) return;
        let timer: ReturnType<typeof setInterval> | null = null;
        const stop = () => {
            if (timer !== null) clearInterval(timer);
            timer = null;
        };
        const start = () => {
            stop();
            timer = setInterval(() => void run("poll"), intervalMs);
        };
        const handleVisibility = () => {
            if (document.hidden) {
                stop();
                return;
            }
            void run("poll");
            start();
        };

        if (!document.hidden) {
            void run("poll");
            start();
        }
        document.addEventListener("visibilitychange", handleVisibility);
        return () => {
            stop();
            document.removeEventListener("visibilitychange", handleVisibility);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, intervalMs]);

    return {trigger: () => run("manual")};
}

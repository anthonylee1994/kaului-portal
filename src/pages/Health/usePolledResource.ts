import React from "react";
import {normalizeError, type ApiError} from "@/api/errors";
import {usePolling} from "@/hooks/usePolling";

const FALLBACK_RETRY_AFTER = 60;

type Phase = "loading" | "ready" | "error";

interface State<T> {
    data: T | null;
    phase: Phase;
    error: ApiError | null;
    updatedAt: number | null; // client time of the last successful response
    stale: boolean; // the latest refresh failed but older data is still shown
}

export interface PolledResource<T> extends State<T> {
    fetching: boolean;
    refresh: () => Promise<void>;
}

export function usePolledResource<T>(fetcher: () => Promise<T>, intervalMs: number): PolledResource<T> {
    const [state, setState] = React.useState<State<T>>({data: null, phase: "loading", error: null, updatedAt: null, stale: false});
    const [fetching, setFetching] = React.useState(false);
    // After a 401 the session is over: stop polling instead of piling up failures on a dead token.
    const [unauthorized, setUnauthorized] = React.useState(false);
    // Responses arriving after unmount are dropped. Requests never overlap (usePolling), so no per-request sequence is needed.
    // A flag, not a counter: StrictMode runs mount -> cleanup -> mount while the first request is still in flight, and that response must still land.
    // No AbortController: the api client turns a cancel into an ApiError.
    const mounted = React.useRef(false);
    const pausedUntil = React.useRef(0);

    React.useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const task = async (source: "poll" | "manual") => {
        // A 429 pause only holds back the timer; a manual refresh may still try.
        if (source === "poll" && Date.now() < pausedUntil.current) return;
        setFetching(true);
        try {
            const data = await fetcher();
            if (!mounted.current) return;
            pausedUntil.current = 0;
            setState({data, phase: "ready", error: null, updatedAt: Date.now(), stale: false});
        } catch (e) {
            if (!mounted.current) return;
            const error = normalizeError(e);
            if (error.status === 401) {
                setUnauthorized(true);
                return;
            }
            if (error.status === 429) pausedUntil.current = Date.now() + (error.retryAfter ?? FALLBACK_RETRY_AFTER) * 1000;
            // With data on screen a failure only marks it stale; the old numbers never flash away.
            setState(current => (current.data !== null ? {...current, stale: true} : {...current, phase: "error", error}));
        } finally {
            if (mounted.current) setFetching(false);
        }
    };

    const {trigger} = usePolling(task, {intervalMs, enabled: !unauthorized});

    return {...state, fetching, refresh: trigger};
}

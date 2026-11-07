import React from "react";
import {getUser} from "@/api/endpoints/users";
import {normalizeError, type ApiError} from "@/api/errors";
import type {AdminUser} from "@/api/types";

type Phase = "loading" | "ready" | "notFound" | "error";

interface State {
    id: string; // the user id this state belongs to
    user: AdminUser | null;
    phase: Phase;
    error: ApiError | null;
}

function emptyState(id: string): State {
    return {id, user: null, phase: "loading", error: null};
}

export function useUser(id: string): {
    user: AdminUser | null;
    phase: Phase;
    error: ApiError | null;
    reload: () => void;
} {
    const [state, setState] = React.useState<State>(() => emptyState(id));
    // Bumped by every request, id change and unmount; a response from an older seq is dropped.
    // No AbortController: the api client turns a cancel into an ApiError, which looks like a real failure.
    const requestSeq = React.useRef(0);

    const fetchUser = (keepCurrent: boolean) => {
        const seq = ++requestSeq.current;
        setState(current => (keepCurrent && current.id === id && current.phase === "ready" ? current : emptyState(id)));
        getUser(id).then(
            user => {
                if (seq !== requestSeq.current) return;
                setState({id, user, phase: "ready", error: null});
            },
            (e: unknown) => {
                if (seq !== requestSeq.current) return;
                const error = normalizeError(e);
                setState(error.status === 404 ? {id, user: null, phase: "notFound", error: null} : {id, user: null, phase: "error", error});
            }
        );
    };

    React.useEffect(() => {
        fetchUser(false);
        return () => {
            requestSeq.current++;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // For one render after an id change the state still holds the previous user: never show it.
    const view = state.id === id ? state : emptyState(id);

    return {user: view.user, phase: view.phase, error: view.error, reload: () => fetchUser(true)};
}

import React from "react";
import {getReport} from "@/api/endpoints/reports";
import {normalizeError, type ApiError} from "@/api/errors";
import type {ReportItem} from "@/api/types";

type Phase = "loading" | "ready" | "notFound" | "error";

interface State {
    id: string; // the report id this state belongs to
    report: ReportItem | null;
    phase: Phase;
    error: ApiError | null;
}

function emptyState(id: string): State {
    return {id, report: null, phase: "loading", error: null};
}

export function useReport(id: string): {
    report: ReportItem | null;
    phase: Phase;
    error: ApiError | null;
    reload: () => void;
} {
    const [state, setState] = React.useState<State>(() => emptyState(id));
    // Bumped by every request, id change and unmount; a response from an older seq is dropped.
    // No AbortController: the api client turns a cancel into an ApiError, which looks like a real failure.
    const requestSeq = React.useRef(0);

    const fetchReport = (keepCurrent: boolean) => {
        const seq = ++requestSeq.current;
        setState(current => (keepCurrent && current.id === id && current.phase === "ready" ? current : emptyState(id)));
        getReport(id).then(
            report => {
                if (seq !== requestSeq.current) return;
                setState({id, report, phase: "ready", error: null});
            },
            (e: unknown) => {
                if (seq !== requestSeq.current) return;
                const error = normalizeError(e);
                setState(error.status === 404 ? {id, report: null, phase: "notFound", error: null} : {id, report: null, phase: "error", error});
            }
        );
    };

    React.useEffect(() => {
        fetchReport(false);
        return () => {
            requestSeq.current++;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // For one render after an id change the state still holds the previous report: never show it.
    const view = state.id === id ? state : emptyState(id);

    return {report: view.report, phase: view.phase, error: view.error, reload: () => fetchReport(true)};
}

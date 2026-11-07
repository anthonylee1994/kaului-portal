import React from "react";
import {listReports, type ReportStatusFilter} from "@/api/endpoints/reports";
import {normalizeError, type ApiError} from "@/api/errors";
import type {ReportItem} from "@/api/types";

export const PAGE_SIZE = 50;

type Phase = "loading" | "refreshing" | "ready" | "error";

interface State {
    status: ReportStatusFilter; // the tab these items belong to
    items: ReportItem[];
    hasMore: boolean;
    phase: Phase;
    error: ApiError | null;
    loadMoreError: ApiError | null;
    isLoadingMore: boolean;
}

function emptyState(status: ReportStatusFilter): State {
    return {status, items: [], hasMore: false, phase: "loading", error: null, loadMoreError: null, isLoadingMore: false};
}

export function useReportList(status: ReportStatusFilter): {
    items: ReportItem[];
    hasMore: boolean;
    phase: Phase;
    error: ApiError | null; // first-page / refresh failure
    loadMoreError: ApiError | null; // append failure, items kept
    isLoadingMore: boolean;
    refresh: () => void;
    loadMore: () => void;
} {
    const [state, setState] = React.useState<State>(() => emptyState(status));
    // Bumped by every first-page / refresh request, tab switch and unmount; a response from an older seq is dropped.
    // No AbortController: the api client turns a cancel into an ApiError, which looks like a real failure.
    const requestSeq = React.useRef(0);
    const loadingMore = React.useRef(false);

    const fetchFirstPage = (kind: "loading" | "refreshing") => {
        const seq = ++requestSeq.current;
        loadingMore.current = false;
        setState(current => (kind === "loading" ? emptyState(status) : {...current, status, phase: "refreshing", error: null, loadMoreError: null, isLoadingMore: false}));
        listReports({status, limit: PAGE_SIZE}).then(
            response => {
                if (seq !== requestSeq.current) return;
                setState({status, items: response.items, hasMore: response.has_more, phase: "ready", error: null, loadMoreError: null, isLoadingMore: false});
            },
            (e: unknown) => {
                if (seq !== requestSeq.current) return;
                setState(current => ({...current, phase: "error", error: normalizeError(e)}));
            }
        );
    };

    React.useEffect(() => {
        fetchFirstPage("loading");
        return () => {
            requestSeq.current++;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    // For one render after a tab switch the state still holds the previous tab: never show it.
    const view = state.status === status ? state : emptyState(status);

    const refresh = () => {
        if (view.phase === "loading") return;
        fetchFirstPage("refreshing");
    };

    const loadMore = () => {
        const last = view.items.at(-1);
        if (view.phase !== "ready" || !view.hasMore || loadingMore.current || !last) return;
        const seq = requestSeq.current;
        loadingMore.current = true;
        setState(current => ({...current, isLoadingMore: true, loadMoreError: null}));
        listReports({status, before: last.id, limit: PAGE_SIZE}).then(
            response => {
                if (seq !== requestSeq.current) return;
                loadingMore.current = false;
                setState(current => {
                    const known = new Set(current.items.map(item => item.id));
                    const fresh = response.items.filter(item => !known.has(item.id));
                    return {...current, items: [...current.items, ...fresh], hasMore: response.has_more, isLoadingMore: false};
                });
            },
            (e: unknown) => {
                if (seq !== requestSeq.current) return;
                loadingMore.current = false;
                setState(current => ({...current, isLoadingMore: false, loadMoreError: normalizeError(e)}));
            }
        );
    };

    return {
        items: view.items,
        hasMore: view.hasMore,
        phase: view.phase,
        error: view.error,
        loadMoreError: view.loadMoreError,
        isLoadingMore: view.isLoadingMore,
        refresh,
        loadMore,
    };
}

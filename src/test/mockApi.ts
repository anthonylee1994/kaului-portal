import {AxiosError, AxiosHeaders} from "axios";
import type {AdminMetrics} from "@/api/types";
import {apiClient} from "@/api/client";

export interface MockReply {
    status: number;
    data?: unknown;
    headers?: Record<string, string>;
}

export interface RecordedRequest {
    url: string;
    authorization: string | null;
}

export const metricsFixture: AdminMetrics = {
    server_now: 1_700_000_000_000,
    uptime_secs: 10,
    db: {
        write_wait_ms: {count: 0, p50: 0, p95: 0, p99: 0, max: 0},
        sqlite_busy_total: 0,
    },
    jobs: {
        ready: 0,
        locked: 0,
        failed_total: 0,
        oldest_ready_age_ms: null,
        latency_ms: {count: 0, p50: 0, p95: 0, p99: 0, max: 0},
    },
    sse: {connections: 0, evictions_total: 0},
    http: {
        responses_5xx_total: 0,
        rate_limited_total: {api: 0, admin_fail: 0},
    },
    events: {max_id: 0},
};

export function errorBody(code: string, message = code) {
    return {error: {code, message, details: null}};
}

// Replaces the axios adapter so no real HTTP happens; non-2xx replies reject like real axios does.
export function mockApi(handler: (request: RecordedRequest) => MockReply | Promise<MockReply>) {
    const requests: RecordedRequest[] = [];
    apiClient.defaults.adapter = async config => {
        const headers = AxiosHeaders.from(config.headers as AxiosHeaders);
        const authorization = headers.get("Authorization");
        const request: RecordedRequest = {
            url: config.url ?? "",
            authorization: typeof authorization === "string" ? authorization : null,
        };
        requests.push(request);
        const reply = await handler(request);
        const response = {
            status: reply.status,
            statusText: String(reply.status),
            data: reply.data,
            headers: new AxiosHeaders(reply.headers),
            config,
            request: {},
        };
        if (reply.status >= 200 && reply.status < 300) return response;
        throw new AxiosError(`Request failed with status code ${reply.status}`, AxiosError.ERR_BAD_REQUEST, config, {}, response);
    };
    return requests;
}

export function mockNetworkError() {
    apiClient.defaults.adapter = async config => {
        throw new AxiosError("Network Error", AxiosError.ERR_NETWORK, config, {});
    };
}

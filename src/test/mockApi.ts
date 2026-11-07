import {AxiosError, AxiosHeaders} from "axios";
import type {AdminMetrics, AdminUser, Evidence, EvidenceMessage, ReportItem, ReportListResponse} from "@/api/types";
import {apiClient} from "@/api/client";

export interface MockReply {
    status: number;
    data?: unknown;
    headers?: Record<string, string>;
}

export interface RecordedRequest {
    method: string;
    url: string;
    body: unknown;
    authorization: string | null;
    params: Record<string, unknown>;
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

let fixtureCounter = 0;

// UUIDv7-shaped ids: the leading chars are a shared timestamp, only the tail differs.
function fixtureId(prefix: string, n: number): string {
    return `0192f3a1-7c2e-7b4d-${prefix}-${String(n).padStart(12, "0")}`;
}

export function reportFixture(overrides: Partial<ReportItem> = {}): ReportItem {
    fixtureCounter += 1;
    return {
        id: fixtureId("8a11", fixtureCounter),
        reporter_id: fixtureId("9b22", fixtureCounter),
        target: {id: fixtureId("ac33", fixtureCounter), status: "active", open_reports: 1},
        reason: "harassment",
        detail: null,
        status: "open",
        created_at: 1_700_000_000_000,
        resolved_at: null,
        ...overrides,
    };
}

export function adminUserFixture(overrides: Partial<AdminUser> = {}): AdminUser {
    fixtureCounter += 1;
    return {
        id: fixtureId("ac33", fixtureCounter),
        status: "active",
        created_at: 1_700_000_000_000,
        last_active_at: 1_700_000_100_000,
        inbox_count: 4,
        open_reports: 1,
        total_reports: 2,
        has_active_title: true,
        title: "Some title",
        avatar_url: null,
        tags: [],
        ...overrides,
    };
}

export function evidenceMessageFixture(overrides: Partial<EvidenceMessage> = {}): EvidenceMessage {
    fixtureCounter += 1;
    return {
        id: fixtureId("5e44", fixtureCounter),
        sender_id: fixtureId("9b22", fixtureCounter),
        kind: "text",
        body: "hello",
        image_url: null,
        created_at: 1_700_000_000_000,
        ...overrides,
    };
}

export function evidenceFixture(overrides: Partial<Evidence> = {}): Evidence {
    return {title: "Some title", avatar_url: null, messages: [], ...overrides};
}

export function reportListReply(items: ReportItem[], hasMore = false): MockReply {
    const data: ReportListResponse = {items, has_more: hasMore};
    return {status: 200, data};
}

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
            method: (config.method ?? "get").toUpperCase(),
            body: typeof config.data === "string" ? (JSON.parse(config.data) as unknown) : undefined,
            url: config.url ?? "",
            authorization: typeof authorization === "string" ? authorization : null,
            params: (config.params as Record<string, unknown> | undefined) ?? {},
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

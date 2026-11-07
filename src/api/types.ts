export type ReportReason = "spam" | "harassment" | "inappropriate" | "underage" | "other";
export type ReportStatus = "open" | "dismissed" | "actioned";
export type UserStatus = "active" | "banned" | "deleted";

export interface ReportItem {
    id: string;
    reporter_id: string;
    reporter_title?: string | null; // 舉報人當前 active Title
    reporter_avatar_url?: string | null;
    target: {id: string; status: UserStatus; open_reports: number; title?: string | null; avatar_url?: string | null};
    reason: ReportReason;
    detail: string | null; // ≤ 500 字
    status: ReportStatus;
    created_at: number;
    resolved_at: number | null;
    evidence?: Evidence | null; // 只喺 GET /reports/{id};超過 90 日會被清成 null
}

export interface BanResponse {
    status: "banned";
}

export interface UnbanResponse {
    status: "active";
}

export interface ReportListResponse {
    items: ReportItem[];
    has_more: boolean;
}

export interface Evidence {
    title: string | null; // target 舉報當刻嘅 active Title
    avatar_url: string | null;
    messages: EvidenceMessage[]; // reporter ↔ target 最近 20 則,新→舊;沒有互動 = []
}

export interface EvidenceMessage {
    id: string;
    sender_id: string;
    kind: "text" | "image";
    body: string | null;
    image_url: string | null;
    created_at: number;
}

export interface AdminUser {
    id: string;
    status: UserStatus;
    created_at: number;
    last_active_at: number;
    inbox_count: number;
    open_reports: number;
    total_reports: number;
    has_active_title: boolean;
    title: string | null; // 當前 active Title
    avatar_url: string | null;
    tags: string[]; // 最多 3 個,已按字母排序
}

export interface FailedJobItem {
    id: string;
    kind: string;
    attempts: number;
    last_error: string | null;
    failed_at: number;
}

export interface Hist {
    count: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
}

export interface AdminMetrics {
    server_now: number;
    uptime_secs: number;
    db: {write_wait_ms: Hist; sqlite_busy_total: number};
    jobs: {
        ready: number;
        locked: number;
        failed_total: number;
        oldest_ready_age_ms: number | null;
        latency_ms: Hist;
    };
    sse: {connections: number; evictions_total: number};
    http: {
        responses_5xx_total: number;
        rate_limited_total: Record<string, number>; // key 為動態,不可寫死
    };
    events: {max_id: number};
}

export interface ApiErrorBody {
    error: {code: string; message: string; details?: {field?: string} | null};
}

import axios from "axios";
import type {ApiErrorBody} from "./types";

export class ApiError extends Error {
    status: number | null; // null = 網絡錯 / 冇 response
    code: string | null; // error.code,例如 UNAUTHENTICATED
    details: {field?: string} | null;
    requestId: string | null; // X-Request-Id
    retryAfter: number | null; // 秒;讀 Retry-After header

    constructor(init: {message: string; status: number | null; code: string | null; details: {field?: string} | null; requestId: string | null; retryAfter: number | null}) {
        super(init.message);
        this.name = "ApiError";
        this.status = init.status;
        this.code = init.code;
        this.details = init.details;
        this.requestId = init.requestId;
        this.retryAfter = init.retryAfter;
    }
}

function readHeader(headers: unknown, name: string): string | null {
    if (!headers || typeof headers !== "object") return null;
    const getter = (headers as {get?: (key: string) => unknown}).get;
    const raw = typeof getter === "function" ? getter.call(headers, name) : (headers as Record<string, unknown>)[name.toLowerCase()];
    return typeof raw === "string" || typeof raw === "number" ? String(raw) : null;
}

function parseRetryAfter(raw: string | null): number | null {
    if (raw === null || !/^\d+$/.test(raw.trim())) return null;
    return Number.parseInt(raw.trim(), 10);
}

function readBody(data: unknown): ApiErrorBody["error"] | null {
    if (typeof data !== "object" || data === null) return null;
    const error = (data as {error?: unknown}).error;
    if (typeof error !== "object" || error === null) return null;
    const {code, message, details} = error as Record<string, unknown>;
    if (typeof code !== "string" || typeof message !== "string") return null;
    const field = typeof details === "object" && details !== null ? (details as {field?: unknown}).field : undefined;
    return {
        code,
        message,
        details: typeof field === "string" ? {field} : null,
    };
}

// Deliberately copies only plain fields: the axios error carries request headers (the token).
export function normalizeError(e: unknown): ApiError {
    if (e instanceof ApiError) return e;
    if (axios.isAxiosError(e)) {
        const response = e.response;
        if (!response) {
            return new ApiError({
                message: e.message,
                status: null,
                code: null,
                details: null,
                requestId: null,
                retryAfter: null,
            });
        }
        const body = readBody(response.data);
        return new ApiError({
            message: body?.message ?? `HTTP ${response.status}`,
            status: response.status,
            code: body?.code ?? null,
            details: body?.details ?? null,
            requestId: readHeader(response.headers, "X-Request-Id"),
            retryAfter: parseRetryAfter(readHeader(response.headers, "Retry-After")),
        });
    }
    return new ApiError({
        message: e instanceof Error ? e.message : "Unknown error",
        status: null,
        code: null,
        details: null,
        requestId: null,
        retryAfter: null,
    });
}

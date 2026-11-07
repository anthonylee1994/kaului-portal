export const HEALTH_POLL_MS = 15_000;

export type Severity = "ok" | "warn" | "danger";

// Only these limiter keys have a defined meaning; any other key is listed without colour.
const WARN_LIMITER_KEYS = new Set(["api", "admin_fail"]);

function isPositive(total: number): boolean {
    return Number.isFinite(total) && total > 0;
}

export function dbBusySeverity(total: number): Severity {
    return isPositive(total) ? "danger" : "ok";
}

export function failedJobsSeverity(total: number): Severity {
    return isPositive(total) ? "danger" : "ok";
}

export function limiterSeverity(key: string, total: number): Severity {
    return WARN_LIMITER_KEYS.has(key) && isPositive(total) ? "warn" : "ok";
}

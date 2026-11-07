import {t} from "@/i18n";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

export function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return t("health.unavailable");
    if (ms < SECOND) return t("health.durationMs", {n: Math.floor(ms)});
    // Floored to one decimal so 59 999 ms never rounds up to "60.0 秒".
    if (ms < MINUTE) return t("health.durationSeconds", {n: (Math.floor(ms / 100) / 10).toFixed(1)});
    return t("health.durationMinutesSeconds", {m: Math.floor(ms / MINUTE), s: Math.floor((ms % MINUTE) / SECOND)});
}

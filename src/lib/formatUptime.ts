import {t} from "@/i18n";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatUptime(secs: number): string {
    if (!Number.isFinite(secs) || secs < 0) return t("health.unavailable");
    if (secs >= DAY) return t("health.uptimeDaysHours", {d: Math.floor(secs / DAY), h: Math.floor((secs % DAY) / HOUR)});
    if (secs >= HOUR) return t("health.uptimeHoursMinutes", {h: Math.floor(secs / HOUR), m: Math.floor((secs % HOUR) / MINUTE)});
    if (secs >= MINUTE) return t("health.uptimeMinutes", {m: Math.floor(secs / MINUTE)});
    return t("health.uptimeUnderMinute");
}

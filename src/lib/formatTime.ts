import {t} from "@/i18n";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const RELATIVE_LIMIT_DAYS = 30;

const absoluteFormat = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
});

// YYYY-MM-DD HH:mm:ss in the browser's local time zone.
export function formatAbsoluteTime(value: number): string {
    const parts: Record<string, string> = {};
    for (const part of absoluteFormat.formatToParts(new Date(value))) {
        parts[part.type] = part.value;
    }
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function formatRelativeTime(value: number, now: number): string {
    const diff = now - value;
    // Future timestamps (clock skew) read as "just now", never as a negative number.
    if (diff < MINUTE) return t("common.time.justNow");
    if (diff < HOUR) return t("common.time.minutesAgo", {n: Math.floor(diff / MINUTE)});
    if (diff < DAY) return t("common.time.hoursAgo", {n: Math.floor(diff / HOUR)});
    if (diff < RELATIVE_LIMIT_DAYS * DAY) return t("common.time.daysAgo", {n: Math.floor(diff / DAY)});
    return formatAbsoluteTime(value).slice(0, 10);
}

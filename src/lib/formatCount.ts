import {t} from "@/i18n";

// Backend numbers are rendered as-is; anything that is not a finite number shows a dash instead of throwing.
export function formatCount(value: unknown): string {
    return typeof value === "number" && Number.isFinite(value) ? String(value) : t("health.unavailable");
}

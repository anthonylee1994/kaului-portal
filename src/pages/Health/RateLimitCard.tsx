import React from "react";
import type {AdminMetrics} from "@/api/types";
import {t, type TextKey} from "@/i18n";
import {formatCount} from "@/lib/formatCount";
import {limiterSeverity} from "@/lib/healthRules";
import {MetricCard} from "./MetricCard";
import {MetricRow} from "./MetricRow";

const HINT_KEYS: Record<string, TextKey> = {
    api: "health.rateLimitApiHint",
    admin_fail: "health.rateLimitAdminFailHint",
};

// The key set belongs to the backend: render whatever arrives, sorted so the order never follows JSON field order.
export const RateLimitCard = ({metrics}: {metrics: AdminMetrics}) => {
    const entries = Object.entries(metrics.http.rate_limited_total).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return (
        <MetricCard title={t("health.rateLimitTitle")}>
            {entries.length === 0 ? (
                <p className="text-sm text-black/60">{t("health.noRateLimits")}</p>
            ) : (
                <dl className="space-y-1">
                    {entries.map(([key, total]) => {
                        const severity = limiterSeverity(key, total);
                        const hintKey = HINT_KEYS[key];
                        return <MetricRow key={key} mono label={key} value={formatCount(total)} severity={severity} hint={hintKey ? t(hintKey) : undefined} />;
                    })}
                </dl>
            )}
        </MetricCard>
    );
};

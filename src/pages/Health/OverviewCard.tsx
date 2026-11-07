import React from "react";
import type {AdminMetrics} from "@/api/types";
import {t} from "@/i18n";
import {formatCount} from "@/lib/formatCount";
import {formatUptime} from "@/lib/formatUptime";
import {MetricCard} from "./MetricCard";
import {MetricRow} from "./MetricRow";

export const OverviewCard = ({metrics}: {metrics: AdminMetrics}) => (
    <MetricCard title={t("health.overviewTitle")}>
        <div>
            <p className="text-sm text-black/60">{t("health.uptime")}</p>
            <p className="font-mono text-xl font-semibold tabular-nums">{formatUptime(metrics.uptime_secs)}</p>
        </div>
        <dl className="space-y-1">
            <MetricRow label={t("health.sseConnections")} value={formatCount(metrics.sse.connections)} />
            <MetricRow label={t("health.responses5xx")} value={formatCount(metrics.http.responses_5xx_total)} />
        </dl>
        <p className="text-xs text-black/60">{t("health.countersResetNote")}</p>
    </MetricCard>
);

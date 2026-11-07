import React from "react";
import type {AdminMetrics} from "@/api/types";
import {t} from "@/i18n";
import {formatCount} from "@/lib/formatCount";
import {formatDuration} from "@/lib/formatDuration";
import {failedJobsSeverity} from "@/lib/healthRules";
import {HistRows} from "./HistRows";
import {MetricCard} from "./MetricCard";
import {MetricRow} from "./MetricRow";

export const JobsCard = ({metrics}: {metrics: AdminMetrics}) => {
    const {jobs} = metrics;
    return (
        <MetricCard title={t("health.jobsTitle")}>
            <dl className="space-y-1">
                <MetricRow label={t("health.jobsReady")} value={formatCount(jobs.ready)} />
                <MetricRow label={t("health.jobsLocked")} value={formatCount(jobs.locked)} />
                <MetricRow label={t("health.jobsFailed")} value={formatCount(jobs.failed_total)} severity={failedJobsSeverity(jobs.failed_total)} />
                <MetricRow label={t("health.oldestReady")} value={jobs.oldest_ready_age_ms === null ? t("health.unavailable") : formatDuration(jobs.oldest_ready_age_ms)} />
            </dl>
            <div className="space-y-1">
                <p className="text-sm text-black/60">{t("health.latency")}</p>
                <HistRows hist={jobs.latency_ms} />
            </div>
        </MetricCard>
    );
};

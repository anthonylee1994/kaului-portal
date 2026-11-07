import React from "react";
import type {ReportItem} from "@/api/types";
import {IdTag} from "@/components/IdTag";
import {ReasonChip} from "@/components/ReasonChip";
import {StatusChip} from "@/components/StatusChip";
import {TimeText} from "@/components/TimeText";
import {t} from "@/i18n";

export const ReportHeader = ({report}: {report: ReportItem}) => (
    <section className="space-y-3 rounded-2xl border border-black/15 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
            <ReasonChip value={report.reason} />
            <StatusChip kind="report" value={report.status} />
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
                <dt className="text-xs text-black/60">{t("reportDetail.createdAt")}</dt>
                <dd>
                    <TimeText value={report.created_at} mode="both" />
                </dd>
            </div>
            {report.resolved_at !== null && (
                <div>
                    <dt className="text-xs text-black/60">{t("reportDetail.resolvedAt")}</dt>
                    <dd>
                        <TimeText value={report.resolved_at} mode="both" />
                    </dd>
                </div>
            )}
        </dl>
        <div className="break-all">
            <IdTag id={report.id} full />
        </div>
    </section>
);

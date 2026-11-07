import React from "react";
import type {ReportItem} from "@/api/types";
import {StatusChip} from "@/components/StatusChip";
import {TimeText} from "@/components/TimeText";
import {t} from "@/i18n";

export const ResolvedCard = ({report}: {report: ReportItem}) => (
    <section className="space-y-2 rounded-2xl border border-black/15 bg-white p-4 text-sm">
        <StatusChip kind="report" value={report.status} />
        {report.status === "dismissed" && <p>{t("reportDetail.resultDismissed")}</p>}
        {report.status === "actioned" && <p>{t("reportDetail.resultActioned")}</p>}
        {report.resolved_at !== null && (
            <p className="text-black/60">
                {t("reportDetail.resolvedAt")}:<TimeText value={report.resolved_at} mode="both" />
            </p>
        )}
    </section>
);

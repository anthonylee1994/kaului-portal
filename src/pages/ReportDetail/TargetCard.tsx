import React from "react";
import {ArrowRight} from "lucide-react";
import {Link} from "react-router";
import type {ReportItem} from "@/api/types";
import {IdTag} from "@/components/IdTag";
import {StatusChip} from "@/components/StatusChip";
import {t} from "@/i18n";
import {REPEAT_OFFENDER_THRESHOLD} from "@/lib/reportRules";

export const TargetCard = ({target}: {target: ReportItem["target"]}) => {
    const repeatOffender = target.open_reports >= REPEAT_OFFENDER_THRESHOLD;
    return (
        <section className="space-y-3 rounded-2xl border border-black/15 bg-white p-4">
            <h2 className="text-sm font-semibold">{t("reportDetail.targetTitle")}</h2>
            <div className="flex flex-wrap items-center gap-2">
                <span className="break-all">
                    <IdTag id={target.id} full />
                </span>
                <StatusChip kind="user" value={target.status} />
            </div>
            <p className="flex items-center gap-2 text-sm">
                <span className="text-black/60">{t("reportDetail.openReports")}</span>
                {repeatOffender ? (
                    <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">{target.open_reports}</span>
                ) : (
                    <span>{target.open_reports}</span>
                )}
            </p>
            <Link to={`/users/${encodeURIComponent(target.id)}`} className="inline-flex items-center gap-1 text-sm font-medium underline">
                {t("reportDetail.viewUser")}
                <ArrowRight aria-hidden className="size-4" />
            </Link>
        </section>
    );
};

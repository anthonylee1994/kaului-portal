import React from "react";
import {Link} from "react-router";
import type {ReportItem} from "@/api/types";
import {IdTag} from "@/components/IdTag";
import {ReasonChip} from "@/components/ReasonChip";
import {StatusChip} from "@/components/StatusChip";
import {TimeText} from "@/components/TimeText";
import {t} from "@/i18n";
import {REPEAT_OFFENDER_THRESHOLD} from "@/lib/reportRules";

const SKELETON_ROWS = 5;

const CELL = "px-4 py-3 whitespace-nowrap";

export const ReportsTable = ({items, loading}: {items: ReportItem[]; loading: boolean}) => (
    <div className="overflow-x-auto rounded-2xl border border-black/15 bg-white">
        <table className="w-full text-left text-sm">
            <thead className="border-b border-black/15 text-xs text-black/60">
                <tr>
                    <th className={`${CELL} font-medium`}>{t("reports.colTime")}</th>
                    <th className={`${CELL} font-medium`}>{t("reports.colReason")}</th>
                    <th className={`${CELL} font-medium`}>{t("reports.colTarget")}</th>
                    <th className={`${CELL} text-right font-medium`}>{t("reports.colRepeat")}</th>
                    <th className={`${CELL} font-medium`}>{t("reports.colReporter")}</th>
                    <th className={`${CELL} font-medium`}>{t("reports.colStatus")}</th>
                </tr>
            </thead>
            <tbody>{loading ? Array.from({length: SKELETON_ROWS}, (_, index) => <SkeletonRow key={index} />) : items.map(item => <ReportRow key={item.id} item={item} />)}</tbody>
        </table>
    </div>
);

const SkeletonRow = () => (
    <tr aria-hidden className="border-b border-black/10 last:border-b-0">
        {Array.from({length: 6}, (_, index) => (
            <td key={index} className={CELL}>
                <div className="h-4 w-20 animate-pulse rounded bg-black/10" />
            </td>
        ))}
    </tr>
);

const ReportRow = ({item}: {item: ReportItem}) => {
    const repeat = item.target.open_reports;
    const repeatOffender = repeat >= REPEAT_OFFENDER_THRESHOLD;
    return (
        <tr className="relative cursor-pointer border-b border-black/10 last:border-b-0 hover:bg-black/5">
            <td className={CELL}>
                {/* Stretched link: the pseudo-element covers the whole row so it is clickable, while a real <a> keeps middle / Cmd+click. */}
                <Link to={`/reports/${item.id}`} aria-label={t("reports.openReport", {id: item.id.slice(-8)})} className="before:absolute before:inset-0">
                    <TimeText value={item.created_at} />
                </Link>
            </td>
            <td className={CELL}>
                <ReasonChip value={item.reason} />
            </td>
            <td className={CELL}>
                <span className="relative z-10 inline-flex items-center gap-2">
                    <IdTag id={item.target.id} />
                    <StatusChip kind="user" value={item.target.status} />
                </span>
            </td>
            <td className={`${CELL} text-right`}>
                {repeatOffender ? <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">{repeat}</span> : repeat}
            </td>
            <td className={CELL}>
                <span className="relative z-10 inline-flex">
                    <IdTag id={item.reporter_id} />
                </span>
            </td>
            <td className={CELL}>
                <StatusChip kind="report" value={item.status} />
            </td>
        </tr>
    );
};

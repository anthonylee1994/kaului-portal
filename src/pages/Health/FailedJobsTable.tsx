import React from "react";
import type {FailedJobItem} from "@/api/types";
import {t} from "@/i18n";
import {FailedJobRow} from "./FailedJobRow";

const SKELETON_ROWS = 3;

const CELL = "px-4 py-3 whitespace-nowrap";

// `total` is the cumulative failed counter from metrics; the table can hold fewer rows because the backend sweeps old dead letters.
export const FailedJobsTable = ({items, total, loading}: {items: FailedJobItem[]; total: number | null; loading: boolean}) => {
    const truncated = !loading && total !== null && Number.isFinite(total) && items.length < total;
    return (
        <div className="space-y-2">
            {truncated && <p className="text-sm text-black/60">{t("health.failedJobsTruncated", {n: items.length, total})}</p>}
            {!loading && items.length === 0 ? (
                <p className="py-8 text-center text-black/60">{t("health.noFailedJobs")}</p>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-black/15 bg-white">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-black/15 text-xs text-black/60">
                            <tr>
                                <th className={`${CELL} font-medium`}>{t("health.colKind")}</th>
                                <th className={`${CELL} text-right font-medium`}>{t("health.colAttempts")}</th>
                                <th className={`${CELL} font-medium`}>{t("health.colLastError")}</th>
                                <th className={`${CELL} font-medium`}>{t("health.colFailedAt")}</th>
                            </tr>
                        </thead>
                        <tbody>{loading ? Array.from({length: SKELETON_ROWS}, (_, index) => <SkeletonRow key={index} />) : items.map(item => <FailedJobRow key={item.id} item={item} />)}</tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const SkeletonRow = () => (
    <tr aria-hidden className="border-b border-black/10 last:border-b-0">
        {Array.from({length: 4}, (_, index) => (
            <td key={index} className={CELL}>
                <div className="h-4 w-20 animate-pulse rounded bg-black/10" />
            </td>
        ))}
    </tr>
);

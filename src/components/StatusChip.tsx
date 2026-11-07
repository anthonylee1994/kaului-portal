import React from "react";
import type {ReportStatus, UserStatus} from "@/api/types";
import {t, type TextKey} from "@/i18n";

const BASE = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";
const TONES = {
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    green: "border-green-200 bg-green-50 text-green-700",
    red: "border-red-200 bg-red-50 text-red-700",
    zinc: "border-zinc-200 bg-zinc-100 text-zinc-600",
};

const REPORT_TONES: Record<ReportStatus, keyof typeof TONES> = {open: "amber", dismissed: "zinc", actioned: "green"};
const USER_TONES: Record<UserStatus, keyof typeof TONES> = {active: "green", banned: "red", deleted: "zinc"};

export const StatusChip = ({kind, value}: {kind: "report" | "user"; value: ReportStatus | UserStatus}) => {
    const tones: Record<string, keyof typeof TONES> = kind === "report" ? REPORT_TONES : USER_TONES;
    // An unknown value (the backend added one) shows as-is; t() would throw on it.
    if (!Object.hasOwn(tones, value)) {
        return <span className={`${BASE} ${TONES.zinc}`}>{value}</span>;
    }
    return <span className={`${BASE} ${TONES[tones[value]]}`}>{t(`common.status.${value}` as TextKey)}</span>;
};

import React from "react";
import type {ReportReason} from "@/api/types";
import {t, type TextKey} from "@/i18n";

const BASE = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";
const KNOWN: ReportReason[] = ["spam", "harassment", "inappropriate", "underage", "other"];

export const ReasonChip = ({value}: {value: ReportReason}) => {
    if (!KNOWN.includes(value)) {
        return <span className={`${BASE} border-zinc-200 bg-zinc-100 text-zinc-600`}>{value}</span>;
    }
    const tone = value === "underage" ? "border-red-200 bg-red-50 text-red-700" : "border-black/15 bg-white text-black";
    return <span className={`${BASE} ${tone}`}>{t(`common.reason.${value}` as TextKey)}</span>;
};

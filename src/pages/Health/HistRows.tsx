import React from "react";
import type {Hist} from "@/api/types";
import {t} from "@/i18n";
import {formatCount} from "@/lib/formatCount";

const FIELDS = ["p50", "p95", "p99", "max"] as const;

// Percentiles are bucket upper bounds: shown as plain integers, never with decimals. Unit (ms) lives in the card's caption.
export const HistRows = ({hist}: {hist: Hist}) => {
    const empty = hist.count === 0;
    return (
        <div className="grid grid-cols-4 gap-2" title={t("health.histCount", {n: formatCount(hist.count)})}>
            {FIELDS.map(field => (
                <div key={field} className="text-center">
                    <p className="text-xs text-black/60">{field}</p>
                    <p className="font-mono text-sm tabular-nums">{empty ? t("health.unavailable") : formatCount(hist[field])}</p>
                </div>
            ))}
        </div>
    );
};

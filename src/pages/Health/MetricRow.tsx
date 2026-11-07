import React from "react";
import {t} from "@/i18n";
import type {Severity} from "@/lib/healthRules";

const SEVERITY_CLASS: Record<Severity, string> = {
    ok: "",
    warn: "text-amber-700",
    danger: "text-red-700 font-bold",
};

// Colour is never the only signal: a non-ok row also carries "⚠" and screen-reader text.
// `hint` replaces the generic severity text and doubles as a tooltip; it is not the only place the text lives.
export const MetricRow = ({label, value, severity = "ok", hint, mono = false}: {label: string; value: string; severity?: Severity; hint?: string; mono?: boolean}) => (
    <div className="flex items-baseline justify-between gap-3 text-sm" title={severity !== "ok" ? hint : undefined}>
        <dt className={`text-black/60 ${mono ? "font-mono" : ""}`}>{label}</dt>
        <dd className={`text-right font-mono tabular-nums ${SEVERITY_CLASS[severity]}`}>
            {value}
            {severity !== "ok" && (
                <React.Fragment>
                    {" "}
                    <span aria-hidden>⚠</span>
                    <span className="sr-only">{hint ?? t(severity === "danger" ? "health.severityDanger" : "health.severityWarn")}</span>
                </React.Fragment>
            )}
        </dd>
    </div>
);

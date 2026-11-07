import React from "react";
import {t} from "@/i18n";
import {formatAbsoluteTime, formatRelativeTime} from "@/lib/formatTime";

export const TimeText = ({value, mode = "relative"}: {value: number; mode?: "relative" | "both"}) => {
    const absolute = formatAbsoluteTime(value);
    const relative = formatRelativeTime(value, Date.now());
    const text = mode === "both" ? t("common.time.both", {absolute, relative}) : relative;
    return (
        <time dateTime={new Date(value).toISOString()} title={mode === "both" ? undefined : absolute}>
            {text}
        </time>
    );
};

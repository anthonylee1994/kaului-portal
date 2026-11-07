import React from "react";
import {useNowSeconds} from "@/hooks/useNowSeconds";
import {t} from "@/i18n";

export const UpdatedAt = ({updatedAt}: {updatedAt: number | null}) => {
    const now = useNowSeconds();
    if (updatedAt === null) return null;
    const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000));
    // No aria-live: it changes every second and would flood screen readers.
    return <span className="text-sm text-black/60">{seconds < 60 ? t("health.updatedSecondsAgo", {n: seconds}) : t("health.updatedMinutesAgo", {n: Math.floor(seconds / 60)})}</span>;
};

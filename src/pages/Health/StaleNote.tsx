import React from "react";
import {useNowSeconds} from "@/hooks/useNowSeconds";
import {t} from "@/i18n";

export const StaleNote = ({updatedAt}: {updatedAt: number | null}) => {
    const now = useNowSeconds();
    const seconds = updatedAt === null ? 0 : Math.max(0, Math.floor((now - updatedAt) / 1000));
    return (
        <p role="status" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-sm text-zinc-700">
            {t("health.staleNote", {n: seconds})}
        </p>
    );
};

import React from "react";
import {t} from "@/i18n";

export const DetailCard = ({detail}: {detail: string | null}) => {
    const empty = detail === null || detail.trim() === "";
    return (
        <section className="space-y-2 rounded-2xl border border-black/15 bg-white p-4">
            <h2 className="text-sm font-semibold">{t("reportDetail.detailTitle")}</h2>
            {/* User content: a plain text node only, never HTML. */}
            {empty ? <p className="text-sm text-black/60">{t("reportDetail.noDetail")}</p> : <p className="text-sm break-words whitespace-pre-wrap">{detail}</p>}
        </section>
    );
};

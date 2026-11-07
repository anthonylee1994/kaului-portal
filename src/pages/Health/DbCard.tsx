import React from "react";
import type {AdminMetrics} from "@/api/types";
import {t} from "@/i18n";
import {formatCount} from "@/lib/formatCount";
import {dbBusySeverity} from "@/lib/healthRules";
import {HistRows} from "./HistRows";
import {MetricCard} from "./MetricCard";
import {MetricRow} from "./MetricRow";

export const DbCard = ({metrics}: {metrics: AdminMetrics}) => (
    <MetricCard title={t("health.dbTitle")}>
        <div className="space-y-1">
            <p className="text-sm text-black/60">{t("health.writeWait")}</p>
            <HistRows hist={metrics.db.write_wait_ms} />
        </div>
        <dl>
            <MetricRow label={t("health.sqliteBusy")} value={formatCount(metrics.db.sqlite_busy_total)} severity={dbBusySeverity(metrics.db.sqlite_busy_total)} />
        </dl>
    </MetricCard>
);

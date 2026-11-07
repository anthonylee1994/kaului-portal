import React from "react";
import {Button} from "@heroui/react";
import {Loader2} from "lucide-react";
import {ErrorCard} from "@/components/ErrorCard";
import {t} from "@/i18n";
import {DbCard} from "./DbCard";
import {FailedJobsTable} from "./FailedJobsTable";
import {JobsCard} from "./JobsCard";
import {OverviewCard} from "./OverviewCard";
import {RateLimitCard} from "./RateLimitCard";
import {StaleNote} from "./StaleNote";
import {UpdatedAt} from "./UpdatedAt";
import {useFailedJobs} from "./useFailedJobs";
import {useMetrics} from "./useMetrics";

const SKELETON_CARDS = 4;

export const Health = () => {
    const metrics = useMetrics();
    const failedJobs = useFailedJobs();
    const busy = metrics.fetching || failedJobs.fetching;

    const handleRefresh = () => {
        void metrics.refresh();
        void failedJobs.refresh();
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <h1 className="text-xl font-semibold">{t("health.title")}</h1>
                <div className="flex items-center gap-3">
                    <UpdatedAt updatedAt={metrics.updatedAt} />
                    <Button variant="outline" size="sm" isDisabled={busy} aria-busy={busy} onPress={handleRefresh}>
                        {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
                        {t("health.refresh")}
                    </Button>
                </div>
            </div>

            <div className="space-y-3">
                {metrics.stale && <StaleNote updatedAt={metrics.updatedAt} />}
                {metrics.phase === "loading" && (
                    <div aria-hidden className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {Array.from({length: SKELETON_CARDS}, (_, index) => (
                            <div key={index} className="h-40 animate-pulse rounded-2xl border border-black/15 bg-black/5" />
                        ))}
                    </div>
                )}
                {metrics.phase === "error" && metrics.error && <ErrorCard error={metrics.error} onRetry={() => void metrics.refresh()} />}
                {metrics.phase === "ready" && metrics.data && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <OverviewCard metrics={metrics.data} />
                        <DbCard metrics={metrics.data} />
                        <JobsCard metrics={metrics.data} />
                        <RateLimitCard metrics={metrics.data} />
                    </div>
                )}
            </div>

            <section aria-labelledby="failed-jobs-title" className="space-y-3">
                <h2 id="failed-jobs-title" className="text-sm font-semibold">
                    {t("health.failedJobsTitle")}
                </h2>
                {failedJobs.stale && <StaleNote updatedAt={failedJobs.updatedAt} />}
                {failedJobs.phase === "error" && failedJobs.error ? (
                    <ErrorCard error={failedJobs.error} onRetry={() => void failedJobs.refresh()} />
                ) : (
                    <FailedJobsTable items={failedJobs.data?.items ?? []} total={metrics.data?.jobs.failed_total ?? null} loading={failedJobs.phase === "loading"} />
                )}
            </section>
        </div>
    );
};

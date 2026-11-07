import React from "react";
import {ArrowLeft} from "lucide-react";
import {Link, useParams} from "react-router";
import {ErrorCard} from "@/components/ErrorCard";
import {t} from "@/i18n";
import {ActionCard} from "./ActionCard";
import {DetailCard} from "./DetailCard";
import {EvidenceSection} from "./EvidenceSection";
import {ReportHeader} from "./ReportHeader";
import {ResolvedCard} from "./ResolvedCard";
import {TargetCard} from "./TargetCard";
import {useReport} from "./useReport";

const SkeletonCard = ({className = "h-24"}: {className?: string}) => <div aria-hidden className={`animate-pulse rounded-2xl bg-black/10 ${className}`} />;

export const ReportDetail = () => {
    const {id = ""} = useParams();
    const {report, phase, error, reload} = useReport(id);
    const titleRef = React.useRef<HTMLHeadingElement>(null);

    // Focus the title once on mount; a route id change does not re-focus.
    React.useEffect(() => {
        titleRef.current?.focus();
    }, []);

    return (
        <div className="space-y-4">
            <Link to="/reports" className="inline-flex items-center gap-1 text-sm underline">
                <ArrowLeft aria-hidden className="size-4" />
                {t("reportDetail.back")}
            </Link>
            <h1 ref={titleRef} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
                {t("reportDetail.title")}
            </h1>
            {phase === "loading" && (
                <div className="space-y-4">
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard className="h-64" />
                </div>
            )}
            {phase === "error" && error && <ErrorCard error={error} onRetry={reload} />}
            {phase === "notFound" && (
                <div className="flex flex-col items-center gap-4 py-12">
                    <p className="text-black/60">{t("reportDetail.notFound")}</p>
                    <Link to="/reports" className="rounded-lg border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5">
                        {t("reportDetail.back")}
                    </Link>
                </div>
            )}
            {phase === "ready" && report && (
                // DOM order is the narrow-screen order: Header, Detail, Target (+ result), Evidence.
                // On lg the aside is pinned to the right column and spans the left column's rows.
                <div className="grid gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-2 lg:col-start-1">
                        <ReportHeader report={report} />
                    </div>
                    <div className="lg:col-span-2 lg:col-start-1">
                        <DetailCard detail={report.detail} />
                    </div>
                    <aside className="space-y-4 lg:col-start-3 lg:row-span-3 lg:row-start-1 lg:sticky lg:top-4 lg:self-start">
                        <TargetCard target={report.target} />
                        {report.status === "open" ? <ActionCard report={report} reload={reload} /> : <ResolvedCard report={report} />}
                    </aside>
                    <div className="lg:col-span-2 lg:col-start-1">
                        <EvidenceSection report={report} />
                    </div>
                </div>
            )}
        </div>
    );
};

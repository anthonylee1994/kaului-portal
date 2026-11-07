import React from "react";
import {Button, Tabs} from "@heroui/react";
import {useSearchParams} from "react-router";
import type {ReportStatusFilter} from "@/api/endpoints/reports";
import {ErrorCard} from "@/components/ErrorCard";
import {t} from "@/i18n";
import {ReportsTable} from "./ReportsTable";
import {useReportList} from "./useReportList";

function parseStatus(raw: string | null): ReportStatusFilter {
    return raw === "all" ? "all" : "open";
}

export const Reports = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const status = parseStatus(searchParams.get("status"));
    const list = useReportList(status);
    const titleRef = React.useRef<HTMLHeadingElement>(null);

    React.useEffect(() => {
        titleRef.current?.focus();
    }, []);

    const handleTabChange = (key: React.Key) => {
        setSearchParams({status: String(key)}, {replace: false});
    };

    const loading = list.phase === "loading";
    const showTable = !loading && !(list.phase === "error" && list.items.length === 0);
    const empty = list.phase === "ready" && list.items.length === 0;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <h1 ref={titleRef} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
                    {t("reports.title")}
                </h1>
                <Button variant="outline" size="sm" isDisabled={loading} isPending={list.phase === "refreshing"} onPress={list.refresh}>
                    {t("reports.refresh")}
                </Button>
            </div>
            <Tabs selectedKey={status} onSelectionChange={handleTabChange}>
                <Tabs.ListContainer>
                    <Tabs.List aria-label={t("reports.tabsLabel")}>
                        <Tabs.Tab id="open" aria-label={t("reports.tabOpen")}>
                            {t("reports.tabOpen")}
                            <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab id="all" aria-label={t("reports.tabAll")}>
                            {t("reports.tabAll")}
                            <Tabs.Indicator />
                        </Tabs.Tab>
                    </Tabs.List>
                </Tabs.ListContainer>
            </Tabs>
            {list.phase === "error" && list.error && <ErrorCard error={list.error} onRetry={list.refresh} />}
            {loading && <ReportsTable items={[]} loading />}
            {showTable && !empty && <ReportsTable items={list.items} loading={false} />}
            {empty && <p className="py-12 text-center text-black/60">{status === "open" ? t("reports.emptyOpen") : t("reports.emptyAll")}</p>}
            {list.loadMoreError && (
                <div role="alert" className="flex items-center justify-center gap-3 text-sm text-red-700">
                    <span>{t("reports.loadMoreFailed")}</span>
                    <Button variant="outline" size="sm" onPress={list.loadMore}>
                        {t("reports.retry")}
                    </Button>
                </div>
            )}
            {list.phase === "ready" && list.hasMore && !list.loadMoreError && (
                <div className="flex justify-center">
                    <Button variant="outline" isPending={list.isLoadingMore} onPress={list.loadMore}>
                        {t("reports.loadMore")}
                    </Button>
                </div>
            )}
        </div>
    );
};

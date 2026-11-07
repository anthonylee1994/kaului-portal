import {apiClient} from "../client";
import type {ReportListResponse} from "../types";

export type ReportStatusFilter = "open" | "all";

export interface ListReportsParams {
    status: ReportStatusFilter;
    before?: string; // id of the last loaded item (keyset cursor)
    limit?: number; // 1..100, backend default 50
}

export async function listReports(params: ListReportsParams): Promise<ReportListResponse> {
    const response = await apiClient.get<ReportListResponse>("/admin/reports", {params});
    return response.data;
}

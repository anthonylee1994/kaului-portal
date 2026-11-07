import {apiClient} from "../client";
import {buildNoteBody} from "@/lib/noteRules";
import type {BanResponse, ReportItem, ReportListResponse} from "../types";

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

export async function getReport(id: string): Promise<ReportItem> {
    const response = await apiClient.get<ReportItem>(`/admin/reports/${encodeURIComponent(id)}`);
    return response.data;
}

export async function dismissReport(id: string, note = ""): Promise<ReportItem> {
    const response = await apiClient.post<ReportItem>(`/admin/reports/${encodeURIComponent(id)}/dismiss`, buildNoteBody(note));
    return response.data;
}

// Always the report-scoped ban (audited as report.ban), never /users/{id}/ban.
export async function banFromReport(id: string, note = ""): Promise<BanResponse> {
    const response = await apiClient.post<BanResponse>(`/admin/reports/${encodeURIComponent(id)}/ban`, buildNoteBody(note));
    return response.data;
}

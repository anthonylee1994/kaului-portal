import {apiClient} from "../client";
import type {FailedJobsResponse} from "../types";

export const FAILED_JOBS_LIMIT = 50;

export async function getFailedJobs(limit = FAILED_JOBS_LIMIT): Promise<FailedJobsResponse> {
    const response = await apiClient.get<FailedJobsResponse>("/admin/jobs/failed", {params: {limit}});
    return response.data;
}

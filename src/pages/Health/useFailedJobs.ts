import {getFailedJobs} from "@/api/endpoints/jobs";
import type {FailedJobsResponse} from "@/api/types";
import {HEALTH_POLL_MS} from "@/lib/healthRules";
import {usePolledResource, type PolledResource} from "./usePolledResource";

export function useFailedJobs(): PolledResource<FailedJobsResponse> {
    return usePolledResource(() => getFailedJobs(), HEALTH_POLL_MS);
}

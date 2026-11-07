import {getMetrics} from "@/api/endpoints/metrics";
import type {AdminMetrics} from "@/api/types";
import {HEALTH_POLL_MS} from "@/lib/healthRules";
import {usePolledResource, type PolledResource} from "./usePolledResource";

export function useMetrics(): PolledResource<AdminMetrics> {
    return usePolledResource(() => getMetrics(), HEALTH_POLL_MS);
}

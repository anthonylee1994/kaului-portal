import {apiClient} from "../client";
import type {AdminMetrics} from "../types";

// With `options.token` the request carries its own Authorization and never touches the store:
// the login probe must not persist a token before the backend has confirmed it.
export async function getMetrics(options?: {token?: string}): Promise<AdminMetrics> {
    const response = await apiClient.get<AdminMetrics>(
        "/admin/metrics",
        options?.token
            ? {
                  headers: {Authorization: `Bearer ${options.token}`},
                  skipAuthRedirect: true,
              }
            : undefined
    );
    return response.data;
}

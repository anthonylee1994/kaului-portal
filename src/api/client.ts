import axios from "axios";
import {sessionStore} from "@/session/sessionStore";
import {normalizeError} from "./errors";
import {notifyRateLimited} from "./notifyRateLimited";

declare module "axios" {
    interface AxiosRequestConfig {
        // Login probe: a 401 here means "wrong token", not "session expired".
        skipAuthRedirect?: boolean;
    }
}

const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim().replace(/\/+$/, "");
if (!apiBase) {
    throw new Error("VITE_API_BASE is required");
}

export const apiClient = axios.create({baseURL: `${apiBase}/v1`});

apiClient.interceptors.request.use(config => {
    const token = sessionStore.getState().token;
    if (token && !config.headers.has("Authorization")) {
        config.headers.set("Authorization", `Bearer ${token}`);
    }
    return config;
});

apiClient.interceptors.response.use(undefined, (error: unknown) => {
    const apiError = normalizeError(error);
    const config = axios.isAxiosError(error) ? error.config : undefined;
    if (apiError.status === 401 && !config?.skipAuthRedirect && sessionStore.getState().token) {
        sessionStore.getState().logout({reason: "expired"});
    }
    // The login probe has its own countdown UI, so it never raises the global toast.
    if (apiError.status === 429 && !config?.skipAuthRedirect) {
        notifyRateLimited(apiError);
    }
    return Promise.reject(apiError);
});

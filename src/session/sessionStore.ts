import {create} from "zustand";
import {getMetrics} from "@/api/endpoints/metrics";
import {ApiError} from "@/api/errors";

const STORAGE_KEY = "kaului.portal.token";

export interface SessionState {
    token: string | null;
    logoutReason: "expired" | null; // 供 /login 顯示「登入已失效」
    login: (token: string) => Promise<void>; // 成功 resolve,失敗 throw ApiError
    logout: (options?: {reason?: "expired"}) => void;
    clearLogoutReason: () => void;
}

function readStoredToken(): string | null {
    try {
        return sessionStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

export const sessionStore = create<SessionState>()(set => ({
    token: readStoredToken(),
    logoutReason: null,
    login: async rawToken => {
        const token = rawToken.trim();
        if (!token) {
            throw new ApiError({
                message: "Token is empty",
                status: null,
                code: null,
                details: null,
                requestId: null,
                retryAfter: null,
            });
        }
        // Only a 200 gets past this line; any failure leaves store and storage untouched.
        await getMetrics({token});
        sessionStorage.setItem(STORAGE_KEY, token);
        set({token, logoutReason: null});
    },
    logout: options => {
        sessionStorage.removeItem(STORAGE_KEY);
        set({token: null, logoutReason: options?.reason ?? null});
    },
    clearLogoutReason: () => set({logoutReason: null}),
}));

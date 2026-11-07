import {toast} from "@heroui/react";
import {t} from "@/i18n";
import type {ApiError} from "./errors";

const FALLBACK_RETRY_AFTER = 60;

// While the limit window is open, further 429s stay silent so a polling page cannot flood the screen.
let suppressedUntil = 0;

// Exception to "error toasts persist": a rate limit expires by itself, so the toast expires with it.
export function notifyRateLimited(error: ApiError): void {
    const now = Date.now();
    if (now < suppressedUntil) return;
    const seconds = error.retryAfter ?? FALLBACK_RETRY_AFTER;
    suppressedUntil = now + seconds * 1000;
    toast.danger(t("common.rateLimitedToast", {n: seconds}), {timeout: seconds * 1000});
}

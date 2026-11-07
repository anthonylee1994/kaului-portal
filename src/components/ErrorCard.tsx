import React from "react";
import type {ApiError} from "@/api/errors";
import {useCountdown} from "@/hooks/useCountdown";
import {t} from "@/i18n";

const FALLBACK_RETRY_AFTER = 60;
const COPIED_MS = 1500;

function titleOf(error: ApiError): string {
    if (error.status === null) return t("common.errorNetwork");
    if (error.status === 429) return t("common.errorRateLimited");
    return t("common.errorServer");
}

export const ErrorCard = ({error, onRetry, title}: {error: ApiError; onRetry?: () => void; title?: string}) => {
    const [copied, setCopied] = React.useState(false);
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const remaining = useCountdown(error.status === 429 ? (error.retryAfter ?? FALLBACK_RETRY_AFTER) : null);

    React.useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        []
    );

    const handleCopy = async () => {
        if (!error.requestId) return;
        try {
            await navigator.clipboard.writeText(error.requestId);
        } catch {
            return;
        }
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    };

    return (
        <div role="alert" className="space-y-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
            <p className="font-medium">{title ?? titleOf(error)}</p>
            {remaining > 0 && <p>{t("common.errorRateLimitedRetry", {seconds: remaining})}</p>}
            {error.requestId && (
                <p className="flex items-center gap-2 font-mono text-xs">
                    <span>{t("common.requestId", {id: error.requestId})}</span>
                    <button type="button" className="cursor-pointer rounded border border-red-200 px-1.5 py-0.5 font-sans hover:bg-red-100" onClick={handleCopy}>
                        {copied ? t("common.copied") : t("common.copyId")}
                    </button>
                </p>
            )}
            {onRetry && (
                <button
                    type="button"
                    disabled={remaining > 0}
                    className="cursor-pointer rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-medium hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={onRetry}
                >
                    {t("common.retry")}
                </button>
            )}
        </div>
    );
};

import React from "react";
import {t} from "@/i18n";

const SHORT_LENGTH = 8;
const COPIED_MS = 1500;

// The short form is the LAST 8 chars: backend ids are UUIDv7, so the leading chars are a timestamp and collide.
// `label` replaces the shown text (e.g. a Title) while the click still copies the id.
export const IdTag = ({id, full = false, label}: {id: string; full?: boolean; label?: string | null}) => {
    const [copied, setCopied] = React.useState(false);
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        []
    );

    const handleClick = async (event: React.MouseEvent) => {
        event.stopPropagation();
        try {
            await navigator.clipboard.writeText(id);
        } catch {
            return; // Copy failed or unavailable: stay silent.
        }
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    };

    const shown = full || id.length < SHORT_LENGTH ? id : id.slice(-SHORT_LENGTH);

    return (
        <button
            type="button"
            className={`cursor-pointer rounded px-1 py-0.5 text-xs transition-colors hover:bg-black/10 ${label ? "max-w-48 truncate" : "font-mono"}`}
            title={id}
            aria-label={t("common.copyId")}
            onClick={handleClick}
        >
            {copied ? t("common.copied") : (label ?? shown)}
        </button>
    );
};

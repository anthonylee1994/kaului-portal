import React from "react";
import type {EvidenceMessage} from "@/api/types";
import {TimeText} from "@/components/TimeText";
import {t} from "@/i18n";
import {SafeImage} from "./SafeImage";

export type Side = "reporter" | "target" | "other";

const SIDE_STYLES: Record<Side, string> = {
    reporter: "self-start bg-black/5",
    target: "self-end border border-black/15 bg-white",
    other: "self-start border border-zinc-200 bg-zinc-100",
};

const SIDE_LABELS = {
    reporter: "reportDetail.senderReporter",
    target: "reportDetail.senderTarget",
    other: "reportDetail.senderOther",
} as const;

export const EvidenceBubble = ({message, side, onOpenImage}: {message: EvidenceMessage; side: Side; onOpenImage: (src: string) => void}) => {
    const imageFailed = <span className="text-sm text-black/60">{t("reportDetail.imageFailed")}</span>;
    return (
        <li className={`flex max-w-[80%] flex-col gap-1 rounded-xl px-3 py-2 ${SIDE_STYLES[side]}`}>
            <span className="text-xs text-black/60">{t(SIDE_LABELS[side])}</span>
            {message.kind === "image" ? (
                message.image_url === null ? (
                    imageFailed
                ) : (
                    <SafeImage
                        src={message.image_url}
                        alt={t("reportDetail.imageAlt")}
                        fallback={imageFailed}
                        className="max-h-40 max-w-40 rounded-lg object-cover"
                        render={image => (
                            <button type="button" aria-label={t("reportDetail.enlargeImage")} className="cursor-pointer self-start rounded-lg" onClick={() => onOpenImage(message.image_url as string)}>
                                {image}
                            </button>
                        )}
                    />
                )
            ) : (
                <p className="text-sm break-words whitespace-pre-wrap">{message.body ?? t("reportDetail.emptyMessage")}</p>
            )}
            <span className="text-xs text-black/60">
                <TimeText value={message.created_at} />
            </span>
        </li>
    );
};

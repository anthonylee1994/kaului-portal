import React from "react";
import {Modal} from "@heroui/react";
import {User} from "lucide-react";
import type {ReportItem} from "@/api/types";
import {t} from "@/i18n";
import {EvidenceBubble, type Sender, type Side} from "./EvidenceBubble";
import {SafeImage} from "./SafeImage";

export const EvidenceSection = ({report}: {report: ReportItem}) => {
    const [lightboxSrc, setLightboxSrc] = React.useState<string | null>(null);
    const chatRef = React.useRef<HTMLUListElement>(null);
    const evidence = report.evidence ?? null;
    const hasMessages = evidence !== null && evidence.messages.length > 0;

    // Scroll to the newest message once the chat is first rendered.
    React.useEffect(() => {
        const chat = chatRef.current;
        if (chat) chat.scrollTop = chat.scrollHeight;
    }, [hasMessages]);

    const sideOf = (senderId: string): Side => (senderId === report.reporter_id ? "reporter" : senderId === report.target.id ? "target" : "other");

    const senderOf = (side: Side): Sender | undefined =>
        side === "reporter" ? {title: report.reporter_title, avatarUrl: report.reporter_avatar_url} : side === "target" ? {title: report.target.title, avatarUrl: report.target.avatar_url} : undefined;

    return (
        <section className="space-y-3 rounded-2xl border border-black/15 bg-white p-4">
            <h2 className="text-sm font-semibold">{t("reportDetail.evidenceTitle")}</h2>
            <p role="note" className="rounded-xl border border-zinc-200 bg-zinc-100 px-3.5 py-2 text-sm text-zinc-600">
                {t("reportDetail.snapshotNote")}
            </p>
            {evidence === null ? (
                <p className="py-6 text-center text-sm text-black/60">{t("reportDetail.expired")}</p>
            ) : (
                <React.Fragment>
                    <div className="flex items-center gap-3">
                        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black/10 text-black/40">
                            <SafeImage src={evidence.avatar_url} alt={t("reportDetail.avatarAlt")} className="size-12 rounded-full object-cover" fallback={<User aria-hidden className="size-6" />} />
                        </div>
                        <p className="text-base break-words">{evidence.title ?? t("reportDetail.noTitle")}</p>
                    </div>
                    {hasMessages ? (
                        // Backend sends newest first; show oldest first without mutating the original array.
                        <ul ref={chatRef} className="flex max-h-[480px] flex-col gap-3 overflow-y-auto">
                            {[...evidence.messages].reverse().map(message => {
                                const side = sideOf(message.sender_id);
                                return <EvidenceBubble key={message.id} message={message} side={side} sender={senderOf(side)} onOpenImage={setLightboxSrc} />;
                            })}
                        </ul>
                    ) : (
                        <p className="py-6 text-center text-sm text-black/60">{t("reportDetail.noMessages")}</p>
                    )}
                </React.Fragment>
            )}
            <Modal isOpen={lightboxSrc !== null} onOpenChange={open => !open && setLightboxSrc(null)}>
                <Modal.Backdrop>
                    <Modal.Container size="cover">
                        <Modal.Dialog aria-label={t("reportDetail.enlargeImage")} className="flex flex-col items-center gap-3 p-4">
                            <Modal.CloseTrigger aria-label={t("reportDetail.closeLightbox")} />
                            <SafeImage
                                src={lightboxSrc}
                                alt={t("reportDetail.imageAlt")}
                                className="max-h-[80vh] max-w-full object-contain"
                                fallback={<p className="py-12 text-sm text-black/60">{t("reportDetail.imageFailed")}</p>}
                            />
                        </Modal.Dialog>
                    </Modal.Container>
                </Modal.Backdrop>
            </Modal>
        </section>
    );
};

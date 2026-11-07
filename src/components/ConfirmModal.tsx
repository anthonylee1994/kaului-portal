import React from "react";
import {Modal} from "@heroui/react";
import {Loader2} from "lucide-react";
import type {ApiError} from "@/api/errors";
import {ErrorCard} from "@/components/ErrorCard";
import {t} from "@/i18n";

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    targetId: string;
    consequences: readonly string[];
    warning?: string;
    confirmLabel: string;
    tone: "danger" | "default";
    pending: boolean;
    error: ApiError | null; // owned by the caller: the modal never swallows a failure
    errorTitle?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmModal = ({isOpen, title, targetId, consequences, warning, confirmLabel, tone, pending, error, errorTitle, onConfirm, onCancel}: ConfirmModalProps) => {
    const confirmClass = tone === "danger" ? "bg-red-600 text-white hover:bg-red-700" : "bg-black text-white hover:bg-black/80";

    return (
        <Modal isOpen={isOpen} onOpenChange={open => !open && !pending && onCancel()}>
            <Modal.Backdrop isDismissable={!pending} isKeyboardDismissDisabled={pending}>
                <Modal.Container size="md">
                    <Modal.Dialog aria-label={title} className="space-y-4 p-5">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-lg font-semibold">{title}</h2>
                            <Modal.CloseTrigger aria-label={t("confirmModal.close")} isDisabled={pending} />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm text-black/60">{t("confirmModal.targetLabel")}</p>
                            <p className="font-mono text-xs break-all select-all">{targetId}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium">{t("confirmModal.consequencesIntro")}</p>
                            <ul className="list-disc space-y-1 pl-5 text-sm">
                                {consequences.map(item => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </div>
                        {warning && (
                            <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm text-amber-800">
                                {warning}
                            </p>
                        )}
                        {error && <ErrorCard error={error} title={errorTitle} />}
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                autoFocus
                                disabled={pending}
                                className="cursor-pointer rounded-lg border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={onCancel}
                            >
                                {t("confirmModal.cancel")}
                            </button>
                            <button
                                type="button"
                                disabled={pending}
                                className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${confirmClass}`}
                                onClick={onConfirm}
                            >
                                {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
                                {confirmLabel}
                            </button>
                        </div>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
};

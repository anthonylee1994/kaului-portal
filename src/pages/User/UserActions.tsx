import React from "react";
import {toast} from "@heroui/react";
import {banUser, unbanUser} from "@/api/endpoints/users";
import {normalizeError, type ApiError} from "@/api/errors";
import type {AdminUser} from "@/api/types";
import {ConfirmModal} from "@/components/ConfirmModal";
import {NoteField} from "@/components/NoteField";
import {t} from "@/i18n";
import {banConsequences} from "@/lib/banConsequences";
import {isNoteFieldError, isNoteTooLong} from "@/lib/noteRules";

const unbanConsequences = [t("unbanConfirm.consequence1")];

export const UserActions = ({user, reload}: {user: AdminUser; reload: () => void}) => {
    const [note, setNote] = React.useState("");
    const [pending, setPending] = React.useState(false);
    const [open, setOpen] = React.useState(false);
    const [error, setError] = React.useState<ApiError | null>(null);
    const [noteServerError, setNoteServerError] = React.useState<string | null>(null);
    // The ref blocks a second submit synchronously; state alone lags one render behind a fast double click.
    const submitting = React.useRef(false);
    const mounted = React.useRef(true);

    React.useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const banned = user.status === "banned";
    const actionable = user.status === "active" || banned;
    const tooLong = isNoteTooLong(note);

    const handleConfirm = async () => {
        if (submitting.current) return;
        submitting.current = true;
        setPending(true);
        setError(null);
        try {
            if (banned) {
                await unbanUser(user.id, note);
            } else {
                await banUser(user.id, note);
            }
            // Both calls are idempotent: any 200 is a success, and the refetch shows the real state.
            toast.success(banned ? t("user.unbannedToast") : t("user.bannedToast"));
            if (mounted.current) {
                setOpen(false);
                setNote("");
                reload();
            }
        } catch (e) {
            const failure = normalizeError(e);
            if (failure.status === 404) {
                toast.danger(t("user.actionNotFound"), {timeout: 0});
                if (mounted.current) {
                    setOpen(false);
                    reload();
                }
            } else if (!mounted.current) {
                // Left the page: nothing to update.
            } else if (isNoteFieldError(failure)) {
                setOpen(false);
                setNoteServerError(failure.message);
            } else {
                setError(failure);
            }
        } finally {
            submitting.current = false;
            if (mounted.current) setPending(false);
        }
    };

    const openModal = () => {
        setError(null);
        setOpen(true);
    };

    const cancelModal = () => {
        if (pending) return;
        setOpen(false);
        setError(null);
    };

    const handleNoteChange = (value: string) => {
        setNote(value);
        setNoteServerError(null);
    };

    return (
        <div className="space-y-3">
            <hr className="my-4 border-black/15" />
            {actionable && (
                <React.Fragment>
                    <NoteField id="user-note" value={note} onChange={handleNoteChange} disabled={pending} serverError={noteServerError} />
                    {/* One node for both actions: the status flips after a refetch, and the modal returns focus to this very button. */}
                    <button
                        type="button"
                        disabled={pending || tooLong}
                        className={`w-full cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${banned ? "bg-black hover:bg-black/80" : "bg-red-600 hover:bg-red-700"}`}
                        onClick={openModal}
                    >
                        {banned ? t("user.unban") : t("user.ban")}
                    </button>
                </React.Fragment>
            )}
            {user.status === "deleted" && <p className="text-xs text-black/60">{t("user.deletedNote")}</p>}
            <span aria-disabled="true" title={t("user.reportsLinkHint")} className="block text-sm text-black/40">
                {t("user.reportsLink")}
            </span>
            {actionable && (
                <ConfirmModal
                    isOpen={open}
                    title={banned ? t("unbanConfirm.title") : t("banConfirm.title")}
                    targetId={user.id}
                    consequences={banned ? unbanConsequences : banConsequences}
                    warning={banned ? t("unbanConfirm.warning") : t("banConfirm.warning")}
                    confirmLabel={banned ? t("unbanConfirm.confirm") : t("banConfirm.confirm")}
                    tone={banned ? "default" : "danger"}
                    pending={pending}
                    error={error}
                    onConfirm={handleConfirm}
                    onCancel={cancelModal}
                />
            )}
        </div>
    );
};

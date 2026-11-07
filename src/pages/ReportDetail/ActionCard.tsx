import React from "react";
import {Loader2} from "lucide-react";
import {useNavigate} from "react-router";
import {banFromReport, dismissReport} from "@/api/endpoints/reports";
import {normalizeError, type ApiError} from "@/api/errors";
import type {ReportItem} from "@/api/types";
import {ConfirmModal} from "@/components/ConfirmModal";
import {ErrorCard} from "@/components/ErrorCard";
import {NoteField} from "@/components/NoteField";
import {t} from "@/i18n";
import {notifySuccess, notifyWarning} from "@/lib/notify";
import {banConsequences} from "@/lib/banConsequences";
import {isNoteFieldError, isNoteTooLong} from "@/lib/noteRules";

export const ActionCard = ({report, reload}: {report: ReportItem; reload: () => void}) => {
    const navigate = useNavigate();
    const [note, setNote] = React.useState("");
    const [pending, setPending] = React.useState(false);
    const [banOpen, setBanOpen] = React.useState(false);
    const [banError, setBanError] = React.useState<ApiError | null>(null);
    const [dismissError, setDismissError] = React.useState<ApiError | null>(null);
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

    const tooLong = isNoteTooLong(note);
    const targetStatus = report.target.status;
    const canBan = targetStatus === "active" && !tooLong;

    const finish = () => {
        // Leave only if the user is still here; otherwise just toast.
        if (mounted.current) navigate("/reports", {replace: true});
    };

    const run = async (action: () => Promise<void>) => {
        if (submitting.current) return;
        submitting.current = true;
        setPending(true);
        try {
            await action();
        } finally {
            submitting.current = false;
            if (mounted.current) setPending(false);
        }
    };

    const handleDismiss = () =>
        run(async () => {
            setDismissError(null);
            try {
                const next = await dismissReport(report.id, note);
                if (next.status === "dismissed") {
                    notifySuccess(t("reportActions.dismissedToast"));
                    finish();
                } else {
                    // Already handled elsewhere: not our dismiss. Refetch instead of trusting a body that may lack evidence.
                    notifyWarning(t("reportActions.alreadyHandledToast"));
                    reload();
                }
            } catch (e) {
                const error = normalizeError(e);
                if (error.status === 404) reload();
                else if (isNoteFieldError(error)) setNoteServerError(error.message);
                else setDismissError(error);
            }
        });

    const handleBan = () =>
        run(async () => {
            setBanError(null);
            try {
                await banFromReport(report.id, note);
                setBanOpen(false);
                notifySuccess(t("reportActions.bannedToast"));
                finish();
            } catch (e) {
                const error = normalizeError(e);
                if (isNoteFieldError(error)) {
                    setBanOpen(false);
                    setNoteServerError(error.message);
                } else {
                    setBanError(error);
                }
            }
        });

    const openBan = () => {
        setBanError(null);
        setBanOpen(true);
    };

    const cancelBan = () => {
        if (pending) return;
        const stale = banError?.status === 404;
        setBanOpen(false);
        setBanError(null);
        if (stale) reload();
    };

    const handleNoteChange = (value: string) => {
        setNote(value);
        setNoteServerError(null);
    };

    const hint = targetStatus === "banned" ? t("reportActions.targetBanned") : targetStatus === "deleted" ? t("reportActions.targetDeleted") : null;

    return (
        <section className="space-y-3 rounded-2xl border border-black/15 bg-white p-4">
            <h2 className="text-sm font-semibold">{t("reportActions.title")}</h2>
            <NoteField id="report-note" value={note} onChange={handleNoteChange} disabled={pending} serverError={noteServerError} />
            <button
                type="button"
                disabled={pending || tooLong}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-black bg-white px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleDismiss}
            >
                {pending && !banOpen && <Loader2 aria-hidden className="size-4 animate-spin" />}
                {t("reportActions.dismiss")}
            </button>
            {dismissError && <ErrorCard error={dismissError} />}
            <hr className="my-4 border-black/15" />
            <button
                type="button"
                disabled={pending || !canBan}
                className="w-full cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={openBan}
            >
                {t("reportActions.ban")}
            </button>
            {hint && <p className="text-xs text-black/60">{hint}</p>}
            <ConfirmModal
                isOpen={banOpen}
                title={t("banConfirm.title")}
                targetId={report.target.id}
                consequences={banConsequences}
                warning={t("banConfirm.warning")}
                confirmLabel={t("banConfirm.confirm")}
                tone="danger"
                pending={pending}
                error={banError}
                errorTitle={banError?.status === 404 ? t("reportActions.banNotFound") : undefined}
                onConfirm={handleBan}
                onCancel={cancelBan}
            />
        </section>
    );
};

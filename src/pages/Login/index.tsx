import React from "react";
import {Navigate, useSearchParams} from "react-router";
import {normalizeError} from "@/api/errors";
import {EyeIcon} from "@/components/EyeIcon";
import {Spinner} from "@/components/Spinner";
import {t} from "@/i18n";
import {safeRedirect} from "@/session/safeRedirect";
import {sessionStore} from "@/session/sessionStore";

const FALLBACK_RETRY_AFTER = 60;
const LOCK_WARNING_FROM = 5;

type LoginError = {kind: "notEnabled"} | {kind: "invalidToken"} | {kind: "rateLimited"} | {kind: "network"} | {kind: "server"; requestId: string | null};

export const Login = () => {
    const [searchParams] = useSearchParams();
    const sessionToken = sessionStore(state => state.token);
    const [showExpired] = React.useState(() => sessionStore.getState().logoutReason === "expired");
    const [value, setValue] = React.useState("");
    const [visible, setVisible] = React.useState(false);
    const [pending, setPending] = React.useState(false);
    const [error, setError] = React.useState<LoginError | null>(null);
    const [failCount, setFailCount] = React.useState(0);
    const [cooldown, setCooldown] = React.useState(0);

    // The expired notice is shown once, then dropped from the store.
    React.useEffect(() => {
        sessionStore.getState().clearLogoutReason();
    }, []);

    // One interval for the whole cooldown; it only restarts when the cooldown flips between 0 and >0.
    const cooling = cooldown > 0;
    React.useEffect(() => {
        if (!cooling) return;
        const timer = setInterval(() => {
            setCooldown(current => Math.max(0, current - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [cooling]);

    React.useEffect(() => {
        if (cooldown === 0) {
            setError(current => (current?.kind === "rateLimited" ? null : current));
        }
    }, [cooldown]);

    if (sessionToken) {
        return <Navigate to={safeRedirect(searchParams.get("redirect"))} replace />;
    }

    const canSubmit = value.trim() !== "" && !pending && !cooling;

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setValue(event.target.value);
        setError(current => (current && current.kind !== "rateLimited" ? null : current));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canSubmit) return;
        setPending(true);
        try {
            await sessionStore.getState().login(value);
            setFailCount(0);
        } catch (e) {
            const apiError = normalizeError(e);
            if (apiError.status === 404) {
                setError({kind: "notEnabled"});
            } else if (apiError.status === 401) {
                setError({kind: "invalidToken"});
                setValue("");
                setFailCount(count => count + 1);
            } else if (apiError.status === 429) {
                if (apiError.retryAfter === null) {
                    console.warn("429 without a readable Retry-After header, assuming 60s");
                }
                setError({kind: "rateLimited"});
                setCooldown(apiError.retryAfter ?? FALLBACK_RETRY_AFTER);
            } else if (apiError.status === null) {
                setError({kind: "network"});
            } else {
                setError({kind: "server", requestId: apiError.requestId});
            }
            setPending(false);
        }
    };

    const inputClass = error ? "border-red-200 bg-red-50/20" : "border-black/15 bg-white";

    return (
        <main className="flex min-h-dvh items-center justify-center bg-[#f2f2f2] px-4 py-12 text-black selection:bg-black selection:text-white">
            <div className="w-full max-w-md">
                <div className="space-y-6 rounded-2xl border border-black/15 bg-white p-7 shadow-lg sm:p-8">
                    <h1 className="text-center text-xl font-semibold tracking-tight">{t("login.title")}</h1>
                    <form className="space-y-4" onSubmit={handleSubmit}>
                        {showExpired && (
                            <div role="status" className="rounded-xl border border-zinc-200 bg-zinc-100 px-3.5 py-2.5 text-sm text-zinc-600">
                                {t("login.expired")}
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <label htmlFor="admin-token" className="text-xs font-medium">
                                {t("login.tokenLabel")}
                            </label>
                            <div className={`relative rounded-xl border transition-colors focus-within:border-black ${inputClass}`}>
                                <input
                                    id="admin-token"
                                    className="w-full rounded-xl bg-transparent py-2.5 pr-10 pl-3.5 font-mono text-sm placeholder:font-sans placeholder:text-black/30 focus:outline-none"
                                    type={visible ? "text" : "password"}
                                    name="admin-token"
                                    autoComplete="off"
                                    spellCheck={false}
                                    placeholder={t("login.tokenPlaceholder")}
                                    value={value}
                                    onChange={handleChange}
                                />
                                <button
                                    type="button"
                                    className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer rounded-md p-1 text-black/40 transition hover:text-black"
                                    aria-label={t("login.toggleVisibility")}
                                    aria-pressed={visible}
                                    onClick={() => setVisible(current => !current)}
                                >
                                    <EyeIcon off={visible} />
                                </button>
                            </div>
                        </div>
                        {error && (
                            <div role="alert" className="space-y-1 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                                <p className="font-medium">{renderError(error, cooldown)}</p>
                                {error.kind === "server" && error.requestId && <p className="font-mono text-xs">{t("login.requestId", {id: error.requestId})}</p>}
                            </div>
                        )}
                        {error?.kind === "invalidToken" && failCount >= LOCK_WARNING_FROM && (
                            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
                                {t("login.lockWarning")}
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <span>{pending ? t("login.submitting") : cooling ? t("login.cooldownButton", {seconds: cooldown}) : t("login.submit")}</span>
                            {pending && <Spinner />}
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
};

function renderError(error: LoginError, cooldown: number): string {
    switch (error.kind) {
        case "notEnabled":
            return t("login.errorNotEnabled");
        case "invalidToken":
            return t("login.errorInvalidToken");
        case "rateLimited":
            return t("login.errorRateLimited", {seconds: cooldown});
        case "network":
            return t("login.errorNetwork");
        case "server":
            return t("login.errorServer");
    }
}

import React from "react";
import {useParams} from "react-router";
import {ErrorCard} from "@/components/ErrorCard";
import {UserLookupForm} from "@/components/UserLookupForm";
import {t} from "@/i18n";
import {UserActions} from "./UserActions";
import {UserSummary} from "./UserSummary";
import {useUser} from "./useUser";

export const User = () => {
    const {id = ""} = useParams();
    const {user, phase, error, reload} = useUser(id);

    return (
        <div className="space-y-4">
            {/* Below md the shell lookup is hidden; this one stays in every state as the way to look again. */}
            <UserLookupForm tone="light" className="flex md:hidden" />
            <h1 className="text-xl font-semibold">{t("user.title")}</h1>
            {phase === "loading" && <div aria-hidden className="h-48 animate-pulse rounded-2xl bg-black/10" />}
            {phase === "error" && error && <ErrorCard error={error} onRetry={reload} />}
            {phase === "notFound" && (
                <div className="flex justify-center py-12">
                    <p className="text-black/60">{t("user.notFound")}</p>
                </div>
            )}
            {phase === "ready" && user && (
                <section className="rounded-2xl border border-black/15 bg-white p-4">
                    <UserSummary user={user} />
                    <UserActions key={user.id} user={user} reload={reload} />
                </section>
            )}
        </div>
    );
};

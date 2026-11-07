import React from "react";
import type {AdminUser} from "@/api/types";
import {IdTag} from "@/components/IdTag";
import {StatusChip} from "@/components/StatusChip";
import {TimeText} from "@/components/TimeText";
import {UserAvatar} from "@/components/UserAvatar";
import {t} from "@/i18n";
import {REPEAT_OFFENDER_THRESHOLD} from "@/lib/reportRules";

export const UserSummary = ({user}: {user: AdminUser}) => {
    const repeatOffender = user.open_reports >= REPEAT_OFFENDER_THRESHOLD;
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3">
                <UserAvatar src={user.avatar_url} alt={t("user.avatarAlt")} size="lg" />
                <div className="min-w-0 space-y-1">
                    {/* The id is never shown; clicking the title copies it. */}
                    <p className="text-base break-words">
                        <IdTag id={user.id} label={user.title ?? t("user.noTitle")} />
                    </p>
                    <StatusChip kind="user" value={user.status} />
                </div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-black/60">{t("user.createdAt")}</dt>
                <dd className="text-black">
                    <TimeText value={user.created_at} mode="both" />
                </dd>
                <dt className="text-black/60">{t("user.lastActiveAt")}</dt>
                <dd className="text-black">
                    <TimeText value={user.last_active_at} mode="both" />
                </dd>
                <dt className="text-black/60">{t("user.inboxCount")}</dt>
                <dd className="text-black">{user.inbox_count}</dd>
                <dt className="text-black/60">{t("user.openReports")}</dt>
                <dd className="text-black">
                    {repeatOffender ? (
                        <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">{user.open_reports}</span>
                    ) : (
                        user.open_reports
                    )}
                </dd>
                <dt className="text-black/60">{t("user.totalReports")}</dt>
                <dd className="text-black">{user.total_reports}</dd>
                <dt className="text-black/60">{t("user.tags")}</dt>
                <dd className="text-black">
                    {user.tags.length === 0 ? (
                        t("user.noTags")
                    ) : (
                        <ul className="flex flex-wrap gap-1.5">
                            {user.tags.map(tag => (
                                <li key={tag} className="rounded-full border border-black/15 bg-black/5 px-2 py-0.5 text-xs break-all">
                                    {tag}
                                </li>
                            ))}
                        </ul>
                    )}
                </dd>
                <dt className="text-black/60">{t("user.hasActiveTitle")}</dt>
                <dd className="text-black">{user.has_active_title ? t("user.yes") : t("user.no")}</dd>
            </dl>
        </div>
    );
};

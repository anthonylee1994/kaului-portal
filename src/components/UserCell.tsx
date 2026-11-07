import React from "react";
import {IdTag} from "@/components/IdTag";
import {UserAvatar} from "@/components/UserAvatar";

// Avatar + Title; clicking the Title copies the user id. Without a Title the short id is shown instead.
// `avatarLink` makes the avatar open the user's page.
export const UserCell = ({id, title, avatarUrl, avatarLink = false}: {id: string; title?: string | null; avatarUrl?: string | null; avatarLink?: boolean}) => (
    <span className="inline-flex items-center gap-2">
        <UserAvatar src={avatarUrl} size="sm" linkTo={avatarLink ? id : undefined} />
        <IdTag id={id} label={title || null} />
    </span>
);

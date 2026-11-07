import React from "react";
import {User} from "lucide-react";
import {IdTag} from "@/components/IdTag";
import {SafeImage} from "@/pages/ReportDetail/SafeImage";

// Avatar + Title; clicking the Title copies the user id. Without a Title the short id is shown instead.
export const UserCell = ({id, title, avatarUrl}: {id: string; title?: string | null; avatarUrl?: string | null}) => (
    <span className="inline-flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black/10 text-black/40">
            <SafeImage src={avatarUrl ?? null} alt="" className="size-7 rounded-full object-cover" fallback={<User aria-hidden className="size-4" />} />
        </span>
        <IdTag id={id} label={title || null} />
    </span>
);

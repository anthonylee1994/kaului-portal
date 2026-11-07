import React from "react";
import {User} from "lucide-react";
import {Link} from "react-router";
import {t} from "@/i18n";
import {SafeImage} from "@/pages/ReportDetail/SafeImage";

const SIZES = {
    xs: {box: "size-5", icon: "size-3"},
    sm: {box: "size-7", icon: "size-4"},
    lg: {box: "size-12", icon: "size-6"},
};

// Round avatar with a placeholder. With `linkTo` (a user id) the avatar links to that user's page.
export const UserAvatar = ({src, alt = "", size, linkTo}: {src?: string | null; alt?: string; size: keyof typeof SIZES; linkTo?: string}) => {
    const {box, icon} = SIZES[size];
    const avatar = (
        <span className={`flex ${box} shrink-0 items-center justify-center overflow-hidden rounded-full bg-black/10 text-black/40`}>
            <SafeImage src={src ?? null} alt={alt} className={`${box} rounded-full object-cover`} fallback={<User aria-hidden className={icon} />} />
        </span>
    );
    if (linkTo === undefined) return avatar;
    return (
        <Link to={`/users/${encodeURIComponent(linkTo)}`} aria-label={t("reportDetail.viewUser")} className="shrink-0 rounded-full">
            {avatar}
        </Link>
    );
};

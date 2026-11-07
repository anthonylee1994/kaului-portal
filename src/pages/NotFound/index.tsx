import React from "react";
import {Link} from "react-router";
import {t} from "@/i18n";

export const NotFound = () => {
    return (
        <React.Fragment>
            <h1 className="text-xl font-semibold">{t("notFound.title")}</h1>
            <Link to="/reports" className="text-accent underline">
                {t("notFound.back")}
            </Link>
        </React.Fragment>
    );
};

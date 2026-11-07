import React from "react";
import {Navigate, Outlet, useLocation} from "react-router";
import {sessionStore} from "@/session/sessionStore";

export const RequireAuth = () => {
    const token = sessionStore(state => state.token);
    const location = useLocation();

    if (!token) {
        const redirect = encodeURIComponent(location.pathname + location.search);
        return <Navigate to={`/login?redirect=${redirect}`} replace />;
    }
    return <Outlet />;
};

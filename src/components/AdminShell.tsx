import React from "react";
import {Lock, User} from "lucide-react";
import {NavLink, Outlet, useNavigate} from "react-router";
import {UserLookupForm} from "@/components/UserLookupForm";
import {t} from "@/i18n";
import {sessionStore} from "@/session/sessionStore";

export const AdminShell = () => {
    const navigate = useNavigate();

    const handleLogout = () => {
        sessionStore.getState().logout();
        navigate("/login", {replace: true});
    };

    const navClass = ({isActive}: {isActive: boolean}) => `whitespace-nowrap transition-colors ${isActive ? "text-base font-semibold text-white" : "text-sm text-white/60 hover:text-white"}`;

    return (
        <div className="portal-shell pt-14">
            <header className="portal-shell__header fixed top-0 left-0 z-50 w-full bg-black text-white">
                <div className="flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-6">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2.5">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-black">
                                <Lock aria-hidden className="size-4.5" />
                            </div>
                            <span className="hidden text-base font-semibold tracking-tight whitespace-nowrap sm:inline">{t("app.name")}</span>
                        </div>
                        <nav className="ml-2 flex items-center gap-5">
                            <NavLink to="/reports" className={navClass}>
                                {t("shell.navReports")}
                            </NavLink>
                            <NavLink to="/health" className={navClass}>
                                {t("shell.navHealth")}
                            </NavLink>
                        </nav>
                    </div>
                    <div className="flex items-center gap-3">
                        <UserLookupForm tone="dark" className="hidden md:flex" />
                        <button
                            className="h-7.5 cursor-pointer rounded-lg border border-white/30 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/10"
                            type="button"
                            onClick={handleLogout}
                        >
                            {t("shell.logout")}
                        </button>
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#cfc4c5]/30 bg-[#1b1b1b] text-white" aria-hidden>
                            <User aria-hidden className="size-4.5" />
                        </div>
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
                <Outlet />
            </main>
        </div>
    );
};

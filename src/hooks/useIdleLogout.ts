import React from "react";
import {sessionStore} from "@/session/sessionStore";

// Keep in sync with the "30 分鐘" in the login.idleLoggedOut copy.
export const IDLE_LOGOUT_MS = 30 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

// Compares timestamps instead of arming one long timeout: background tabs and sleeping laptops make timers unreliable.
// Only DOM events count as activity; programmatic requests (health polling) must not reset the clock.
export function useIdleLogout() {
    React.useEffect(() => {
        let lastActivity = Date.now();
        const markActive = () => {
            lastActivity = Date.now();
        };
        const check = () => {
            if (Date.now() - lastActivity >= IDLE_LOGOUT_MS) {
                sessionStore.getState().logout({reason: "idle"});
            }
        };
        const handleVisibility = () => {
            if (document.visibilityState === "visible") check();
        };

        for (const name of ACTIVITY_EVENTS) document.addEventListener(name, markActive, {passive: true});
        document.addEventListener("visibilitychange", handleVisibility);
        const timer = setInterval(check, CHECK_INTERVAL_MS);
        return () => {
            for (const name of ACTIVITY_EVENTS) document.removeEventListener(name, markActive);
            document.removeEventListener("visibilitychange", handleVisibility);
            clearInterval(timer);
        };
    }, []);
}

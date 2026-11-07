import React from "react";
import {act, render} from "@testing-library/react";
import {sessionStore} from "@/session/sessionStore";
import {IDLE_LOGOUT_MS, useIdleLogout} from "./useIdleLogout";

const Probe = () => {
    useIdleLogout();
    return null;
};

function setVisibility(state: "visible" | "hidden") {
    Object.defineProperty(document, "visibilityState", {configurable: true, get: () => state});
    document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
    vi.useFakeTimers();
    sessionStore.setState({token: "t", logoutReason: null});
});

afterEach(() => {
    vi.useRealTimers();
    setVisibility("visible");
});

describe("useIdleLogout", () => {
    it("is 30 minutes", () => {
        expect(IDLE_LOGOUT_MS).toBe(30 * 60 * 1000);
    });

    it("does not log out just before the limit", () => {
        render(<Probe />);
        act(() => {
            vi.advanceTimersByTime(IDLE_LOGOUT_MS - 1_000);
        });
        expect(sessionStore.getState().token).toBe("t");
    });

    it("logs out with reason idle and clears storage at the limit", () => {
        sessionStorage.setItem("kaului.portal.token", "t");
        render(<Probe />);
        act(() => {
            vi.advanceTimersByTime(IDLE_LOGOUT_MS);
        });
        expect(sessionStore.getState().token).toBeNull();
        expect(sessionStore.getState().logoutReason).toBe("idle");
        expect(sessionStorage.getItem("kaului.portal.token")).toBeNull();
    });

    it.each(["pointerdown", "keydown"])("restarts the clock on %s", name => {
        render(<Probe />);
        act(() => {
            vi.advanceTimersByTime(IDLE_LOGOUT_MS - 60_000);
            document.dispatchEvent(new Event(name));
            vi.advanceTimersByTime(IDLE_LOGOUT_MS - 60_000);
        });
        expect(sessionStore.getState().token).toBe("t");
    });

    it("logs out as soon as the tab is visible again past the limit", () => {
        render(<Probe />);
        setVisibility("hidden");
        // Throttled timers: the clock moves but the interval never fires.
        vi.setSystemTime(Date.now() + IDLE_LOGOUT_MS + 1);
        expect(sessionStore.getState().token).toBe("t");
        act(() => setVisibility("visible"));
        expect(sessionStore.getState().token).toBeNull();
    });

    it("leaves no timers or listeners after unmount", () => {
        const {unmount} = render(<Probe />);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
        act(() => {
            vi.advanceTimersByTime(IDLE_LOGOUT_MS * 2);
        });
        expect(sessionStore.getState().token).toBe("t");
    });
});

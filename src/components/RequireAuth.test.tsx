import React from "react";
import {act, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createMemoryRouter, RouterProvider} from "react-router";
import {routes} from "@/router";
import {sessionStore} from "@/session/sessionStore";

function renderAt(path: string) {
    const router = createMemoryRouter(routes, {initialEntries: [path]});
    render(<RouterProvider router={router} />);
    return router;
}

beforeEach(() => {
    sessionStore.setState({token: null, logoutReason: null});
});

describe("RequireAuth", () => {
    it("redirects to /login with an encoded redirect when there is no token", () => {
        const router = renderAt("/reports/x");
        expect(router.state.location.pathname).toBe("/login");
        expect(router.state.location.search).toBe("?redirect=%2Freports%2Fx");
    });

    it("renders the page inside the shell when logged in", () => {
        sessionStore.setState({token: "t"});
        const router = renderAt("/reports");
        expect(router.state.location.pathname).toBe("/reports");
        expect(screen.getByRole("button", {name: "登出"})).toBeInTheDocument();
    });

    it("logs out idle admins and sends them to /login with the way back", () => {
        vi.useFakeTimers();
        try {
            sessionStore.setState({token: "t"});
            const router = renderAt("/reports/x?a=1");
            act(() => {
                vi.advanceTimersByTime(30 * 60 * 1000);
            });
            expect(sessionStore.getState().token).toBeNull();
            expect(router.state.location.pathname).toBe("/login");
            expect(screen.getByText("因閒置超過 30 分鐘，已自動登出")).toBeInTheDocument();
            expect(router.state.location.search).toBe("?redirect=%2Freports%2Fx%3Fa%3D1");
        } finally {
            vi.useRealTimers();
        }
    });

    it("redirects / to /reports", () => {
        sessionStore.setState({token: "t"});
        const router = renderAt("/");
        expect(router.state.location.pathname).toBe("/reports");
    });

    it("logout lands on plain /login", async () => {
        sessionStore.setState({token: "t"});
        const router = renderAt("/reports");
        await userEvent.click(screen.getByRole("button", {name: "登出"}));
        expect(sessionStore.getState().token).toBeNull();
        expect(router.state.location.pathname).toBe("/login");
        expect(sessionStorage.getItem("kaului.portal.token")).toBeNull();
    });
});

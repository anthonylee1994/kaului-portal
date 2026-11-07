import React from "react";
import {act, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createMemoryRouter, RouterProvider} from "react-router";
import {routes} from "@/router";
import {sessionStore} from "@/session/sessionStore";
import {errorBody, metricsFixture, mockApi, mockNetworkError} from "@/test/mockApi";

function renderLogin(path = "/login", options?: Parameters<typeof userEvent.setup>[0]) {
    const router = createMemoryRouter(routes, {initialEntries: [path]});
    render(<RouterProvider router={router} />);
    return {router, user: userEvent.setup(options)};
}

const input = () => document.querySelector<HTMLInputElement>('input[type="password"]')!;
const submit = () => screen.getByRole("button", {name: "登入系統"});

async function attempt(user: ReturnType<typeof userEvent.setup>, token = "some-token") {
    await user.clear(input());
    await user.type(input(), token);
    await user.click(submit());
}

beforeEach(() => {
    sessionStore.setState({token: null, logoutReason: null});
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("Login page", () => {
    it("disables the button for empty input and does not send a request", async () => {
        const requests = mockApi(() => ({status: 200, data: metricsFixture}));
        const {user} = renderLogin();
        expect(submit()).toBeDisabled();
        await user.type(input(), "   ");
        expect(submit()).toBeDisabled();
        expect(requests).toHaveLength(0);
    });

    it("uses a non-password name and autocomplete off", () => {
        renderLogin();
        expect(input()).toHaveAttribute("autocomplete", "off");
        expect(input().name).not.toBe("password");
    });

    it("shows the 404 message", async () => {
        mockApi(() => ({status: 404, data: errorBody("NOT_FOUND")}));
        const {user} = renderLogin();
        await attempt(user);
        expect(await screen.findByText("後台未啟用")).toBeInTheDocument();
        expect(submit()).toBeEnabled();
    });

    it("shows the 401 message and clears the input", async () => {
        mockApi(() => ({
            status: 401,
            data: errorBody("UNAUTHENTICATED", "backend secret text"),
        }));
        const {user} = renderLogin();
        await attempt(user, "wrong");
        expect(await screen.findByText("令牌不正確")).toBeInTheDocument();
        expect(screen.queryByText("backend secret text")).not.toBeInTheDocument();
        expect(input().value).toBe("");
    });

    it("shows the network message", async () => {
        mockNetworkError();
        const {user} = renderLogin();
        await attempt(user);
        expect(await screen.findByText("無法連線至伺服器")).toBeInTheDocument();
    });

    it("shows the generic server error with the request id", async () => {
        mockApi(() => ({
            status: 500,
            data: "oops",
            headers: {"x-request-id": "req-9"},
        }));
        const {user} = renderLogin();
        await attempt(user);
        expect(await screen.findByText("伺服器錯誤，請稍後再試")).toBeInTheDocument();
        expect(screen.getByText("Request ID:req-9")).toBeInTheDocument();
    });

    it("counts down on 429, keeps the button disabled, then recovers", async () => {
        mockApi(() => ({
            status: 429,
            data: errorBody("RATE_LIMITED"),
            headers: {"retry-after": "3"},
        }));
        const {user} = renderLogin("/login", {
            advanceTimers: vi.advanceTimersByTime,
        });
        vi.useFakeTimers({shouldAdvanceTime: true});
        await attempt(user);
        expect(await screen.findByText("嘗試次數過多，請 3 秒後再試")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "請等待 3 秒後重試"})).toBeDisabled();

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        expect(screen.getByText("嘗試次數過多，請 2 秒後再試")).toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(2000);
        });
        expect(screen.queryByText(/嘗試次數過多/)).not.toBeInTheDocument();
        expect(submit()).toBeEnabled();
    });

    it("falls back to 60s and warns when Retry-After is unreadable", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        mockApi(() => ({status: 429, data: errorBody("RATE_LIMITED")}));
        const {user} = renderLogin();
        await attempt(user);
        expect(await screen.findByText("嘗試次數過多，請 60 秒後再試")).toBeInTheDocument();
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it("shows the lock warning only from the 5th 401", async () => {
        mockApi(() => ({status: 401, data: errorBody("UNAUTHENTICATED")}));
        const {user} = renderLogin();
        for (let i = 1; i <= 4; i++) {
            await attempt(user, `wrong-${i}`);
            expect(await screen.findByText("令牌不正確")).toBeInTheDocument();
        }
        expect(screen.queryByText("同一 IP 每分鐘失敗 10 次將被鎖定")).not.toBeInTheDocument();
        await attempt(user, "wrong-5");
        expect(await screen.findByText("同一 IP 每分鐘失敗 10 次將被鎖定")).toBeInTheDocument();
    });

    it("does not count 404 or network errors towards the lock warning", async () => {
        mockApi(() => ({status: 404, data: errorBody("NOT_FOUND")}));
        const {user} = renderLogin();
        for (let i = 1; i <= 6; i++) {
            await attempt(user, `t-${i}`);
            await waitFor(() => expect(submit()).toBeEnabled());
        }
        expect(screen.queryByText("同一 IP 每分鐘失敗 10 次將被鎖定")).not.toBeInTheDocument();
    });

    it("navigates to the safe redirect after a successful login", async () => {
        mockApi(() => ({status: 200, data: metricsFixture}));
        const {router, user} = renderLogin("/login?redirect=%2Freports%2Fabc");
        await attempt(user, "good");
        await waitFor(() => expect(router.state.location.pathname).toBe("/reports/abc"));
        expect(sessionStore.getState().token).toBe("good");
    });

    it("ignores an unsafe redirect", async () => {
        mockApi(() => ({status: 200, data: metricsFixture}));
        const {router, user} = renderLogin("/login?redirect=%2F%2Fevil.com");
        await attempt(user, "good");
        await waitFor(() => expect(router.state.location.pathname).toBe("/reports"));
    });

    it("shows the expired notice once", () => {
        sessionStore.setState({logoutReason: "expired"});
        renderLogin();
        expect(screen.getByText("登入已失效，請重新登入")).toBeInTheDocument();
        expect(sessionStore.getState().logoutReason).toBeNull();
    });

    it("shows the idle notice once", () => {
        sessionStore.setState({logoutReason: "idle"});
        renderLogin();
        expect(screen.getByText("因閒置超過 30 分鐘，已自動登出")).toBeInTheDocument();
        expect(screen.queryByText("登入已失效，請重新登入")).not.toBeInTheDocument();
        expect(sessionStore.getState().logoutReason).toBeNull();
    });
});

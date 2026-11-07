import React from "react";
import {act, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {toast} from "@heroui/react";
import {createMemoryRouter, RouterProvider} from "react-router";
import {AdminShell} from "@/components/AdminShell";
import {sessionStore} from "@/session/sessionStore";
import {adminUserFixture, errorBody, mockApi, type MockReply, type RecordedRequest} from "@/test/mockApi";
import type {AdminUser} from "@/api/types";
import {User} from "./index";

function renderPage(user: AdminUser, entry = user.id) {
    const router = createMemoryRouter(
        [
            {
                element: <AdminShell />,
                children: [
                    {path: "/users/:id", element: <User />},
                    {path: "/reports", element: <p>list</p>},
                    {path: "/elsewhere", element: <p>elsewhere</p>},
                ],
            },
            {path: "/login", element: <p>login</p>},
        ],
        {initialEntries: [`/users/${encodeURIComponent(entry)}`]}
    );
    render(<RouterProvider router={router} />);
    return {router, user: userEvent.setup()};
}

function deferred() {
    let resolve!: (reply: MockReply) => void;
    const promise = new Promise<MockReply>(r => (resolve = r));
    return {promise, resolve};
}

const posts = (requests: RecordedRequest[]) => requests.filter(r => r.method === "POST");
const gets = (requests: RecordedRequest[]) => requests.filter(r => r.method === "GET");

// A stateful fake backend: ban / unban flip the status, GET returns the current one.
function statefulBackend(initial: AdminUser) {
    let current = initial;
    return mockApi(request => {
        if (request.method === "POST") {
            current = {...current, status: request.url.endsWith("/unban") ? "active" : "banned"};
            return {status: 200, data: {status: current.status}};
        }
        return {status: 200, data: current};
    });
}

beforeEach(() => {
    sessionStore.setState({token: "t", logoutReason: null});
    vi.spyOn(toast, "success").mockReturnValue("1");
    vi.spyOn(toast, "danger").mockReturnValue("2");
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("page states", () => {
    it("loads and shows the user", async () => {
        const user = adminUserFixture();
        mockApi(() => ({status: 200, data: user}));
        renderPage(user);
        expect(await screen.findByText(user.id)).toBeInTheDocument();
        expect(screen.getByText("收件箱數量")).toBeInTheDocument();
    });

    it("shows not found on 404 and keeps both lookup forms", async () => {
        mockApi(() => ({status: 404, data: errorBody("NOT_FOUND")}));
        renderPage(adminUserFixture(), "nope");
        expect(await screen.findByText("用戶不存在或已刪除")).toBeInTheDocument();
        expect(screen.getAllByRole("textbox", {name: "使用者編號查詢"})).toHaveLength(2);
    });

    it("shows an error card on 500 and recovers on retry", async () => {
        const user = adminUserFixture();
        let fail = true;
        mockApi(() => (fail ? {status: 500, data: errorBody("INTERNAL")} : {status: 200, data: user}));
        const {user: ui} = renderPage(user);
        expect(await screen.findByRole("alert")).toBeInTheDocument();
        fail = false;
        await ui.click(screen.getByRole("button", {name: "重試"}));
        expect(await screen.findByText(user.id)).toBeInTheDocument();
    });

    it("never shows the previous user after the id changes", async () => {
        const a = adminUserFixture();
        const b = adminUserFixture();
        const gate = deferred();
        mockApi(request => (request.url.endsWith(b.id) ? gate.promise : {status: 200, data: a}));
        const {router} = renderPage(a);
        await screen.findByText(a.id);
        await act(() => router.navigate(`/users/${b.id}`));
        expect(screen.queryByText(a.id)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "封鎖用戶"})).not.toBeInTheDocument();
        gate.resolve({status: 200, data: b});
        expect(await screen.findByText(b.id)).toBeInTheDocument();
    });

    it("does not flash the loading state during a reload", async () => {
        const user = adminUserFixture();
        const gate = deferred();
        let slow = false;
        mockApi(request => (request.method === "GET" && slow ? gate.promise : request.method === "POST" ? {status: 200, data: {status: "banned"}} : {status: 200, data: user}));
        const {user: ui} = renderPage(user);
        await ui.click(await screen.findByRole("button", {name: "封鎖用戶"}));
        slow = true;
        await ui.click(await screen.findByRole("button", {name: "確認封鎖"}));
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(screen.getByText(user.id)).toBeInTheDocument();
        gate.resolve({status: 200, data: {...user, status: "banned"}});
        expect(await screen.findByRole("button", {name: "解除封鎖"})).toBeInTheDocument();
    });
});

describe("AdminShell lookup", () => {
    it("is enabled and navigates to /users/<id>", async () => {
        const user = adminUserFixture();
        mockApi(() => ({status: 200, data: user}));
        const {router, user: ui} = renderPage(user);
        await screen.findByText(user.id);
        const [shellInput] = screen.getAllByRole("textbox", {name: "使用者編號查詢"});
        expect(shellInput).toBeEnabled();
        await ui.type(shellInput, "xyz{Enter}");
        expect(router.state.location.pathname).toBe("/users/xyz");
    });
});

describe("UserActions visibility", () => {
    it("shows ban for active and unban for banned", async () => {
        const user = adminUserFixture();
        mockApi(() => ({status: 200, data: user}));
        renderPage(user);
        expect(await screen.findByRole("button", {name: "封鎖用戶"})).toBeEnabled();
    });

    it("shows unban for a banned user", async () => {
        const user = adminUserFixture({status: "banned"});
        mockApi(() => ({status: 200, data: user}));
        renderPage(user);
        expect(await screen.findByRole("button", {name: "解除封鎖"})).toBeEnabled();
    });

    it("shows no actions for a deleted user", async () => {
        const user = adminUserFixture({status: "deleted"});
        mockApi(() => ({status: 200, data: user}));
        renderPage(user);
        expect(await screen.findByText("用戶已刪除，無法操作")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "封鎖用戶"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "解除封鎖"})).not.toBeInTheDocument();
        expect(screen.queryByLabelText("備註（選填）")).not.toBeInTheDocument();
    });

    it("shows no actions and does not throw for an unknown status", async () => {
        const user = adminUserFixture({status: "weird" as "active"});
        mockApi(() => ({status: 200, data: user}));
        renderPage(user);
        await screen.findByText(user.id);
        expect(screen.queryByRole("button", {name: "封鎖用戶"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "解除封鎖"})).not.toBeInTheDocument();
        expect(screen.queryByText("用戶已刪除，無法操作")).not.toBeInTheDocument();
    });

    it("renders the reports link as unfocusable disabled text", async () => {
        const user = adminUserFixture();
        mockApi(() => ({status: 200, data: user}));
        renderPage(user);
        const link = await screen.findByText("此用戶的舉報（暫未支援）");
        expect(link).toHaveAttribute("aria-disabled", "true");
        expect(link.tagName).toBe("SPAN");
        expect(link).not.toHaveAttribute("tabindex");
    });
});

describe("ban", () => {
    it("opens a modal first; cancel sends nothing", async () => {
        const user = adminUserFixture();
        const requests = mockApi(() => ({status: 200, data: user}));
        const {user: ui} = renderPage(user);
        await ui.click(await screen.findByRole("button", {name: "封鎖用戶"}));
        expect(within(await screen.findByRole("dialog")).getByText(user.id)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "取消"})).toHaveFocus();
        expect(posts(requests)).toHaveLength(0);
        await ui.click(screen.getByRole("button", {name: "取消"}));
        await waitFor(() => expect(screen.queryByRole("button", {name: "確認封鎖"})).not.toBeInTheDocument());
        expect(posts(requests)).toHaveLength(0);
    });

    it("bans through the user endpoint, stays on the page and flips to unban", async () => {
        const user = adminUserFixture();
        const requests = statefulBackend(user);
        const {user: ui, router} = renderPage(user);
        await ui.type(await screen.findByLabelText("備註（選填）"), " spam ");
        await ui.click(screen.getByRole("button", {name: "封鎖用戶"}));
        await ui.click(await screen.findByRole("button", {name: "確認封鎖"}));
        expect(await screen.findByRole("button", {name: "解除封鎖"})).toBeInTheDocument();
        expect(posts(requests)[0]).toMatchObject({url: `/admin/users/${user.id}/ban`, body: {note: "spam"}});
        expect(toast.success).toHaveBeenCalledWith("已封鎖");
        expect(router.state.location.pathname).toBe(`/users/${user.id}`);
        expect(screen.getByLabelText("備註（選填）")).toHaveValue("");
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("keeps focus on the same action button after the status flips", async () => {
        const user = adminUserFixture();
        statefulBackend(user);
        const {user: ui} = renderPage(user);
        await ui.click(await screen.findByRole("button", {name: "封鎖用戶"}));
        await ui.click(await screen.findByRole("button", {name: "確認封鎖"}));
        const button = await screen.findByRole("button", {name: "解除封鎖"});
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(button).toHaveFocus();
    });

    it("treats a 200 for an already banned user as success", async () => {
        const user = adminUserFixture();
        let banned = false;
        mockApi(request => {
            if (request.method === "POST") return {status: 200, data: {status: "banned"}};
            const reply = {status: 200, data: {...user, status: banned ? "banned" : "active"}};
            banned = true; // someone else banned it right after the first load
            return reply;
        });
        const {user: ui} = renderPage(user);
        await ui.click(await screen.findByRole("button", {name: "封鎖用戶"}));
        await ui.click(await screen.findByRole("button", {name: "確認封鎖"}));
        expect(await screen.findByRole("button", {name: "解除封鎖"})).toBeInTheDocument();
        expect(toast.success).toHaveBeenCalledWith("已封鎖");
    });

    it("sends one request on a double click and locks the card while pending", async () => {
        const user = adminUserFixture();
        const gate = deferred();
        const requests = mockApi(request => (request.method === "POST" ? gate.promise : {status: 200, data: user}));
        const {user: ui} = renderPage(user);
        await ui.click(await screen.findByRole("button", {name: "封鎖用戶"}));
        await ui.dblClick(await screen.findByRole("button", {name: "確認封鎖"}));
        expect(posts(requests)).toHaveLength(1);
        expect(screen.getByLabelText("備註（選填）")).toBeDisabled();
        expect(screen.getByRole("button", {name: "封鎖用戶", hidden: true})).toBeDisabled();
        gate.resolve({status: 200, data: {status: "banned"}});
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
    });

    it("blocks an over-long note without sending", async () => {
        const user = adminUserFixture();
        const requests = mockApi(() => ({status: 200, data: user}));
        const {user: ui} = renderPage(user);
        await ui.click(await screen.findByLabelText("備註（選填）"));
        await ui.paste("a".repeat(201));
        expect(screen.getByText("備註最多 200 字")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "封鎖用戶"})).toBeDisabled();
        expect(posts(requests)).toHaveLength(0);
    });
});

describe("unban", () => {
    it("warns that nothing is restored, then unbans through the user endpoint", async () => {
        const user = adminUserFixture({status: "banned"});
        const requests = statefulBackend(user);
        const {user: ui} = renderPage(user);
        await ui.click(await screen.findByRole("button", {name: "解除封鎖"}));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText(user.id)).toBeInTheDocument();
        expect(within(dialog).getByText(/不會恢復.*match、hello 與 push subscription/)).toBeInTheDocument();
        await ui.click(within(dialog).getByRole("button", {name: "確認解封"}));
        expect(await screen.findByRole("button", {name: "封鎖用戶"})).toBeInTheDocument();
        expect(posts(requests)[0]).toMatchObject({url: `/admin/users/${user.id}/unban`, body: {}});
        expect(toast.success).toHaveBeenCalledWith("已解除封鎖");
    });

    it("sends one request on a double click", async () => {
        const user = adminUserFixture({status: "banned"});
        const gate = deferred();
        const requests = mockApi(request => (request.method === "POST" ? gate.promise : {status: 200, data: user}));
        const {user: ui} = renderPage(user);
        await ui.click(await screen.findByRole("button", {name: "解除封鎖"}));
        await ui.dblClick(await screen.findByRole("button", {name: "確認解封"}));
        expect(posts(requests)).toHaveLength(1);
        gate.resolve({status: 200, data: {status: "active"}});
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
    });
});

describe.each([
    ["ban", "active", "封鎖用戶", "確認封鎖"],
    ["unban", "banned", "解除封鎖", "確認解封"],
] as const)("%s errors", (_name, status, open, confirm) => {
    it("closes the modal, toasts a persistent error and shows not found on 404", async () => {
        const user = adminUserFixture({status});
        let gone = false;
        mockApi(request => {
            if (request.method === "POST") {
                gone = true;
                return {status: 404, data: errorBody("NOT_FOUND")};
            }
            return gone ? {status: 404, data: errorBody("NOT_FOUND")} : {status: 200, data: user};
        });
        const {user: ui} = renderPage(user);
        await ui.click(await screen.findByRole("button", {name: open}));
        await ui.click(await screen.findByRole("button", {name: confirm}));
        expect(await screen.findByText("用戶不存在或已刪除")).toBeInTheDocument();
        expect(toast.danger).toHaveBeenCalledWith("用戶已刪除或不存在，無法操作", {timeout: 0});
        expect(toast.success).not.toHaveBeenCalled();
    });

    it("marks the note and clears the mark on edit after a 400 on the note field", async () => {
        const user = adminUserFixture({status});
        mockApi(request => (request.method === "POST" ? {status: 400, data: {error: {code: "VALIDATION_FAILED", message: "note too long", details: {field: "note"}}}} : {status: 200, data: user}));
        const {user: ui} = renderPage(user);
        await ui.type(await screen.findByLabelText("備註（選填）"), "x");
        await ui.click(screen.getByRole("button", {name: open}));
        await ui.click(await screen.findByRole("button", {name: confirm}));
        expect(await screen.findByText("note too long")).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        await ui.type(screen.getByLabelText("備註（選填）"), "y");
        expect(screen.queryByText("note too long")).not.toBeInTheDocument();
    });

    it("keeps the modal open on 500 and succeeds on retry", async () => {
        const user = adminUserFixture({status});
        let fail = true;
        mockApi(request => {
            if (request.method !== "POST") return {status: 200, data: user};
            return fail ? {status: 500, data: errorBody("INTERNAL")} : {status: 200, data: {status}};
        });
        const {user: ui} = renderPage(user);
        await ui.click(await screen.findByRole("button", {name: open}));
        await ui.click(await screen.findByRole("button", {name: confirm}));
        expect(await within(await screen.findByRole("dialog")).findByRole("alert")).toBeInTheDocument();
        fail = false;
        await ui.click(screen.getByRole("button", {name: confirm}));
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
    });
});

describe("leaving while pending", () => {
    it("toasts but does not refetch after the page is left", async () => {
        const user = adminUserFixture();
        const gate = deferred();
        const requests = mockApi(request => (request.method === "POST" ? gate.promise : {status: 200, data: user}));
        const {user: ui, router} = renderPage(user);
        await ui.click(await screen.findByRole("button", {name: "封鎖用戶"}));
        await ui.click(await screen.findByRole("button", {name: "確認封鎖"}));
        await act(() => router.navigate("/elsewhere"));
        gate.resolve({status: 200, data: {status: "banned"}});
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("已封鎖"));
        expect(gets(requests)).toHaveLength(1);
        expect(router.state.location.pathname).toBe("/elsewhere");
    });

    it("does not carry the note to another user", async () => {
        const a = adminUserFixture();
        const b = adminUserFixture();
        mockApi(request => ({status: 200, data: request.url.endsWith(b.id) ? b : a}));
        const {user: ui, router} = renderPage(a);
        await ui.type(await screen.findByLabelText("備註（選填）"), "for A");
        await act(() => router.navigate(`/users/${b.id}`));
        await screen.findByText(b.id);
        expect(screen.getByLabelText("備註（選填）")).toHaveValue("");
    });
});

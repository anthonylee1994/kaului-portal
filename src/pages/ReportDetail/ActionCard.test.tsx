import React from "react";
import {act, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {toast} from "@heroui/react";
import {createMemoryRouter, RouterProvider} from "react-router";
import {sessionStore} from "@/session/sessionStore";
import {errorBody, mockApi, reportFixture, type MockReply, type RecordedRequest} from "@/test/mockApi";
import type {ReportItem} from "@/api/types";
import {ReportDetail} from "./index";

function renderPage(report: ReportItem) {
    const router = createMemoryRouter(
        [
            {path: "/reports/:id", element: <ReportDetail />},
            {path: "/reports", element: <p>list</p>},
            {path: "/elsewhere", element: <p>elsewhere</p>},
        ],
        {initialEntries: [`/reports/${report.id}`]}
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

beforeEach(() => {
    sessionStore.setState({token: "t", logoutReason: null});
    vi.spyOn(toast, "success").mockReturnValue("1");
    vi.spyOn(toast, "warning").mockReturnValue("2");
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("ActionCard visibility", () => {
    it("shows actions for an open report", async () => {
        const report = reportFixture();
        mockApi(() => ({status: 200, data: report}));
        renderPage(report);
        expect(await screen.findByRole("button", {name: "駁回"})).toBeEnabled();
        expect(screen.getByRole("button", {name: "封鎖用戶"})).toBeEnabled();
    });

    it.each(["dismissed", "actioned"] as const)("hides actions for a %s report", async status => {
        const report = reportFixture({status, resolved_at: 1_700_000_100_000});
        mockApi(() => ({status: 200, data: report}));
        renderPage(report);
        await screen.findByText("舉報說明");
        expect(screen.queryByRole("button", {name: "駁回"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "封鎖用戶"})).not.toBeInTheDocument();
    });

    it.each([
        ["banned", "用戶已被封鎖"],
        ["deleted", "用戶已刪除，無法封鎖"],
    ] as const)("disables ban for a %s target but keeps dismiss", async (status, hint) => {
        const report = reportFixture({target: {id: "t1", status, open_reports: 1}});
        mockApi(() => ({status: 200, data: report}));
        renderPage(report);
        expect(await screen.findByText(hint)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "封鎖用戶"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "駁回"})).toBeEnabled();
    });

    it("disables ban for an unknown target status without throwing", async () => {
        const report = reportFixture({target: {id: "t1", status: "weird" as "active", open_reports: 1}});
        mockApi(() => ({status: 200, data: report}));
        renderPage(report);
        expect(await screen.findByRole("button", {name: "封鎖用戶"})).toBeDisabled();
    });
});

describe("note", () => {
    it("counts and blocks both actions above 200 characters", async () => {
        const report = reportFixture();
        const requests = mockApi(() => ({status: 200, data: report}));
        const {user} = renderPage(report);
        const box = await screen.findByLabelText("備註（選填）");
        await user.click(box);
        await user.paste("a".repeat(201));
        expect(screen.getByText("201/200")).toBeInTheDocument();
        expect(screen.getByText("備註最多 200 字")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "駁回"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "封鎖用戶"})).toBeDisabled();
        expect(posts(requests)).toHaveLength(0);
        await user.type(box, "{Backspace}");
        expect(screen.getByRole("button", {name: "駁回"})).toBeEnabled();
    });

    it("marks the field when the backend rejects the note, and clears it on edit", async () => {
        const report = reportFixture();
        mockApi(request => (request.method === "POST" ? {status: 400, data: {error: {code: "VALIDATION_FAILED", message: "note too long", details: {field: "note"}}}} : {status: 200, data: report}));
        const {user} = renderPage(report);
        await user.type(await screen.findByLabelText("備註（選填）"), "x");
        await user.click(screen.getByRole("button", {name: "駁回"}));
        expect(await screen.findByText("note too long")).toBeInTheDocument();
        await user.type(screen.getByLabelText("備註（選填）"), "y");
        expect(screen.queryByText("note too long")).not.toBeInTheDocument();
    });
});

describe("dismiss", () => {
    it("sends straight away without a modal, toasts and returns to the list", async () => {
        const report = reportFixture();
        const requests = mockApi(request => (request.method === "POST" ? {status: 200, data: {...report, status: "dismissed", resolved_at: 1}} : {status: 200, data: report}));
        const {user, router} = renderPage(report);
        await user.type(await screen.findByLabelText("備註（選填）"), " reason ");
        await user.click(screen.getByRole("button", {name: "駁回"}));
        await waitFor(() => expect(router.state.location.pathname).toBe("/reports"));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(posts(requests)[0]).toMatchObject({url: `/admin/reports/${report.id}/dismiss`, body: {note: "reason"}});
        expect(toast.success).toHaveBeenCalledWith("已駁回");
    });

    it("treats a non-dismissed reply as already handled: warns, stays, refetches", async () => {
        const report = reportFixture();
        let handled = false;
        const requests = mockApi(request => {
            if (request.method === "POST") {
                handled = true;
                return {status: 200, data: {...report, status: "actioned", resolved_at: 1}};
            }
            return {status: 200, data: handled ? {...report, status: "actioned", resolved_at: 1} : report};
        });
        const {user, router} = renderPage(report);
        await user.click(await screen.findByRole("button", {name: "駁回"}));
        expect(await screen.findByText("此舉報已處置")).toBeInTheDocument();
        expect(toast.warning).toHaveBeenCalledWith("此舉報已被處理");
        expect(toast.success).not.toHaveBeenCalled();
        expect(router.state.location.pathname).toBe(`/reports/${report.id}`);
        expect(requests.filter(r => r.method === "GET")).toHaveLength(2);
    });

    it("shows not found after a 404", async () => {
        const report = reportFixture();
        let gone = false;
        mockApi(request => {
            if (request.method === "POST") {
                gone = true;
                return {status: 404, data: errorBody("NOT_FOUND")};
            }
            return gone ? {status: 404, data: errorBody("NOT_FOUND")} : {status: 200, data: report};
        });
        const {user} = renderPage(report);
        await user.click(await screen.findByRole("button", {name: "駁回"}));
        expect(await screen.findByText("舉報不存在")).toBeInTheDocument();
    });

    it("shows an inline error on 500 and succeeds on a second press", async () => {
        const report = reportFixture();
        let fail = true;
        mockApi(request => {
            if (request.method !== "POST") return {status: 200, data: report};
            return fail ? {status: 500, data: errorBody("INTERNAL")} : {status: 200, data: {...report, status: "dismissed"}};
        });
        const {user, router} = renderPage(report);
        await user.click(await screen.findByRole("button", {name: "駁回"}));
        expect(await screen.findByRole("alert")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "駁回"})).toBeEnabled();
        fail = false;
        await user.click(screen.getByRole("button", {name: "駁回"}));
        await waitFor(() => expect(router.state.location.pathname).toBe("/reports"));
    });

    it("sends only one request on a double click and locks the card while pending", async () => {
        const report = reportFixture();
        const gate = deferred();
        const requests = mockApi(request => (request.method === "POST" ? gate.promise : {status: 200, data: report}));
        const {user} = renderPage(report);
        const button = await screen.findByRole("button", {name: "駁回"});
        await user.dblClick(button);
        expect(posts(requests)).toHaveLength(1);
        expect(screen.getByLabelText("備註（選填）")).toBeDisabled();
        expect(screen.getByRole("button", {name: "封鎖用戶"})).toBeDisabled();
        gate.resolve({status: 200, data: {...report, status: "dismissed"}});
    });
});

describe("ban", () => {
    it("opens a modal first and sends nothing until confirmed; cancel sends nothing", async () => {
        const report = reportFixture();
        const requests = mockApi(() => ({status: 200, data: report}));
        const {user} = renderPage(report);
        await user.click(await screen.findByRole("button", {name: "封鎖用戶"}));
        expect(within(await screen.findByRole("dialog")).getByText(report.target.id)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "取消"})).toHaveFocus();
        expect(posts(requests)).toHaveLength(0);
        await user.click(screen.getByRole("button", {name: "取消"}));
        await waitFor(() => expect(screen.queryByRole("button", {name: "確認封鎖"})).not.toBeInTheDocument());
        expect(posts(requests)).toHaveLength(0);
    });

    it("bans through the report endpoint with the note, toasts and returns to the list", async () => {
        const report = reportFixture();
        const requests = mockApi(request => (request.method === "POST" ? {status: 200, data: {status: "banned"}} : {status: 200, data: report}));
        const {user, router} = renderPage(report);
        await user.type(await screen.findByLabelText("備註（選填）"), "spam");
        await user.click(screen.getByRole("button", {name: "封鎖用戶"}));
        await user.click(await screen.findByRole("button", {name: "確認封鎖"}));
        await waitFor(() => expect(router.state.location.pathname).toBe("/reports"));
        expect(posts(requests)[0]).toMatchObject({url: `/admin/reports/${report.id}/ban`, body: {note: "spam"}});
        expect(toast.success).toHaveBeenCalledWith("已封鎖");
    });

    it("keeps the modal open on 404 and refetches after it is closed", async () => {
        const report = reportFixture();
        const requests = mockApi(request => (request.method === "POST" ? {status: 404, data: errorBody("NOT_FOUND")} : {status: 200, data: report}));
        const {user} = renderPage(report);
        await user.click(await screen.findByRole("button", {name: "封鎖用戶"}));
        await user.click(await screen.findByRole("button", {name: "確認封鎖"}));
        expect(await screen.findByText("用戶已刪除或不存在，無法操作")).toBeInTheDocument();
        expect(requests.filter(r => r.method === "GET")).toHaveLength(1);
        await user.click(screen.getByRole("button", {name: "取消"}));
        await waitFor(() => expect(requests.filter(r => r.method === "GET")).toHaveLength(2));
    });

    it("keeps the modal open on 500 and succeeds on retry", async () => {
        const report = reportFixture();
        let fail = true;
        mockApi(request => {
            if (request.method !== "POST") return {status: 200, data: report};
            return fail ? {status: 500, data: errorBody("INTERNAL")} : {status: 200, data: {status: "banned"}};
        });
        const {user, router} = renderPage(report);
        await user.click(await screen.findByRole("button", {name: "封鎖用戶"}));
        await user.click(await screen.findByRole("button", {name: "確認封鎖"}));
        expect(await screen.findByRole("alert")).toBeInTheDocument();
        fail = false;
        await user.click(screen.getByRole("button", {name: "確認封鎖"}));
        await waitFor(() => expect(router.state.location.pathname).toBe("/reports"));
    });

    it("sends one request on a double click of confirm", async () => {
        const report = reportFixture();
        const gate = deferred();
        const requests = mockApi(request => (request.method === "POST" ? gate.promise : {status: 200, data: report}));
        const {user} = renderPage(report);
        await user.click(await screen.findByRole("button", {name: "封鎖用戶"}));
        await user.dblClick(await screen.findByRole("button", {name: "確認封鎖"}));
        expect(posts(requests)).toHaveLength(1);
        gate.resolve({status: 200, data: {status: "banned"}});
    });

    it("toasts but does not navigate when the page was left while pending", async () => {
        const report = reportFixture();
        const gate = deferred();
        mockApi(request => (request.method === "POST" ? gate.promise : {status: 200, data: report}));
        const {user, router} = renderPage(report);
        await user.click(await screen.findByRole("button", {name: "駁回"}));
        await act(() => router.navigate("/elsewhere"));
        gate.resolve({status: 200, data: {...report, status: "dismissed"}});
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(router.state.location.pathname).toBe("/elsewhere");
    });
});

import React from "react";
import {act, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createMemoryRouter, RouterProvider} from "react-router";
import {sessionStore} from "@/session/sessionStore";
import {errorBody, evidenceFixture, mockApi, mockNetworkError, reportFixture, type MockReply} from "@/test/mockApi";
import {ReportDetail} from "./index";

function renderPage(path: string) {
    const router = createMemoryRouter(
        [
            {path: "/reports/:id", element: <ReportDetail />},
            {path: "/reports", element: <p>list</p>},
        ],
        {initialEntries: [path]}
    );
    render(<RouterProvider router={router} />);
    return {router, user: userEvent.setup()};
}

function deferred() {
    let resolve!: (reply: MockReply) => void;
    const promise = new Promise<MockReply>(r => (resolve = r));
    return {promise, resolve};
}

const idOf = (url: string) => decodeURIComponent(url.split("/").at(-1) ?? "");

beforeEach(() => {
    sessionStore.setState({token: "t", logoutReason: null});
});

describe("ReportDetail page", () => {
    it("fetches the route id and shows content", async () => {
        const report = reportFixture({detail: "line", evidence: evidenceFixture()});
        const requests = mockApi(() => ({status: 200, data: report}));
        renderPage(`/reports/${report.id}`);
        expect(await screen.findByText("line")).toBeInTheDocument();
        expect(requests[0].url).toBe(`/admin/reports/${report.id}`);
        expect(screen.getByRole("heading", {level: 1, name: "舉報詳情"})).toHaveFocus();
    });

    it("shows loading skeletons first", async () => {
        const gate = deferred();
        mockApi(() => gate.promise);
        renderPage("/reports/x");
        expect(screen.getByRole("heading", {name: "舉報詳情"})).toBeInTheDocument();
        expect(screen.queryByText("舉報說明")).not.toBeInTheDocument();
        gate.resolve({status: 200, data: reportFixture()});
        expect(await screen.findByText("舉報說明")).toBeInTheDocument();
    });

    it("shows （無說明） for a null detail and HTML detail as text", async () => {
        const html = "<b>bold</b><script>x</script>";
        const reports = [reportFixture({detail: null}), reportFixture({detail: html})];
        mockApi(request => ({status: 200, data: reports.find(r => r.id === idOf(request.url))}));
        const {router} = renderPage(`/reports/${reports[0].id}`);
        expect(await screen.findByText("（無說明）")).toBeInTheDocument();
        await router.navigate(`/reports/${reports[1].id}`);
        expect(await screen.findByText(html)).toBeInTheDocument();
        expect(document.querySelector("script")).toBeNull();
    });

    it("shows the target card without the raw id, a red count at 3 and the user link", async () => {
        const report = reportFixture({target: {id: "target-full-id", status: "active", open_reports: 3}});
        mockApi(() => ({status: 200, data: report}));
        renderPage(`/reports/${report.id}`);
        await screen.findByText("3");
        expect(screen.queryByText("target-full-id")).not.toBeInTheDocument();
        expect(screen.getByText("3")).toHaveClass("text-red-700");
        const hrefs = screen.getAllByRole("link", {name: /查看用戶/}).map(link => link.getAttribute("href"));
        expect(hrefs).toContain("/users/target-full-id");
    });

    it("does not highlight 2 open reports", async () => {
        const report = reportFixture({target: {id: "t1", status: "active", open_reports: 2}});
        mockApi(() => ({status: 200, data: report}));
        renderPage(`/reports/${report.id}`);
        expect(await screen.findByText("2")).not.toHaveClass("text-red-700");
    });

    it("shows no result card for an open report", async () => {
        const report = reportFixture();
        mockApi(() => ({status: 200, data: report}));
        renderPage(`/reports/${report.id}`);
        await screen.findByText("舉報說明");
        expect(screen.queryByText("此舉報已駁回")).not.toBeInTheDocument();
        expect(screen.queryByText("此舉報已處置")).not.toBeInTheDocument();
    });

    it.each([
        ["dismissed", "此舉報已駁回"],
        ["actioned", "此舉報已處置"],
    ] as const)("shows the %s result", async (status, text) => {
        const report = reportFixture({status, resolved_at: 1_700_000_100_000});
        mockApi(() => ({status: 200, data: report}));
        renderPage(`/reports/${report.id}`);
        expect(await screen.findByText(text)).toBeInTheDocument();
        expect(screen.getAllByText(/結案時間/)).not.toHaveLength(0);
    });

    it("shows the resolution note as plain text, and omits the label when there is none", async () => {
        const report = reportFixture({status: "dismissed", resolved_at: 1_700_000_100_000, resolution_note: "<b>not</b> abuse"});
        mockApi(() => ({status: 200, data: report}));
        renderPage(`/reports/${report.id}`);
        expect(await screen.findByText("<b>not</b> abuse")).toBeInTheDocument();
        expect(screen.getByText("處理備註")).toBeInTheDocument();
    });

    it("shows no note label for a resolved report without a note", async () => {
        const report = reportFixture({status: "dismissed", resolved_at: 1_700_000_100_000});
        mockApi(() => ({status: 200, data: report}));
        renderPage(`/reports/${report.id}`);
        await screen.findByText("此舉報已駁回");
        expect(screen.queryByText("處理備註")).not.toBeInTheDocument();
    });

    it("does not throw for a resolved report without resolved_at or an unknown status", async () => {
        const report = reportFixture({status: "escalated" as "open", resolved_at: null});
        mockApi(() => ({status: 200, data: report}));
        renderPage(`/reports/${report.id}`);
        expect(await screen.findAllByText("escalated")).not.toHaveLength(0);
        expect(screen.queryByText(/結案時間/)).not.toBeInTheDocument();
    });

    it("clears the old report on id change and drops a stale slow response", async () => {
        const slowA = deferred();
        const a = reportFixture({detail: "report A"});
        const b = reportFixture({detail: "report B"});
        mockApi(request => (idOf(request.url) === a.id ? slowA.promise : {status: 200, data: b}));
        const {router} = renderPage(`/reports/${a.id}`);
        await router.navigate(`/reports/${b.id}`);
        expect(await screen.findByText("report B")).toBeInTheDocument();
        slowA.resolve({status: 200, data: a});
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(screen.queryByText("report A")).not.toBeInTheDocument();
        expect(screen.getByText("report B")).toBeInTheDocument();
    });

    it("clears the previous report while the next one loads", async () => {
        const gate = deferred();
        const a = reportFixture({detail: "report A"});
        const b = reportFixture({detail: "report B"});
        mockApi(request => (idOf(request.url) === a.id ? {status: 200, data: a} : gate.promise));
        const {router} = renderPage(`/reports/${a.id}`);
        await screen.findByText("report A");
        await act(() => router.navigate(`/reports/${b.id}`));
        expect(screen.queryByText("report A")).not.toBeInTheDocument();
        gate.resolve({status: 200, data: b});
        expect(await screen.findByText("report B")).toBeInTheDocument();
    });

    it("shows not found with a link back, and stays logged in", async () => {
        mockApi(() => ({status: 404, data: errorBody("NOT_FOUND")}));
        renderPage("/reports/nope");
        expect(await screen.findByText("舉報不存在")).toBeInTheDocument();
        const links = screen.getAllByRole("link", {name: /返回舉報隊列/});
        links.forEach(link => expect(link).toHaveAttribute("href", "/reports"));
        expect(sessionStore.getState().token).toBe("t");
    });

    it("shows an ErrorCard on 500 and recovers on retry, hiding the backend message", async () => {
        const report = reportFixture({detail: "ok now"});
        let fail = true;
        mockApi(() => (fail ? {status: 500, data: errorBody("INTERNAL", "secret backend text")} : {status: 200, data: report}));
        const {user} = renderPage(`/reports/${report.id}`);
        expect(await screen.findByRole("alert")).toBeInTheDocument();
        expect(screen.queryByText("secret backend text")).not.toBeInTheDocument();
        fail = false;
        await user.click(screen.getByRole("button", {name: "重試"}));
        expect(await screen.findByText("ok now")).toBeInTheDocument();
    });

    it("shows an ErrorCard on a network error", async () => {
        mockNetworkError();
        renderPage("/reports/x");
        expect(await screen.findByText("無法連線至伺服器")).toBeInTheDocument();
    });

    it("shows a countdown on 429", async () => {
        mockApi(() => ({status: 429, data: errorBody("RATE_LIMITED"), headers: {"retry-after": "30"}}));
        renderPage("/reports/x");
        expect(await screen.findByText("30 秒後再試")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole("button", {name: "重試"})).toBeDisabled());
    });
});

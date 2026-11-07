import React from "react";
import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createMemoryRouter, RouterProvider} from "react-router";
import type {ReportItem} from "@/api/types";
import {sessionStore} from "@/session/sessionStore";
import {errorBody, mockApi, mockNetworkError, reportFixture, reportListReply, type MockReply} from "@/test/mockApi";
import {Reports} from "./index";
import {PAGE_SIZE} from "./useReportList";

function renderReports(path = "/reports") {
    const router = createMemoryRouter(
        [
            {path: "/reports", element: <Reports />},
            {path: "/users/:id", element: <p>user</p>},
            {path: "/reports/:id", element: <p>detail</p>},
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

const rowsOf = () => screen.getAllByRole("row").slice(1);

beforeEach(() => {
    sessionStore.setState({token: "t", logoutReason: null});
});

describe("Reports page", () => {
    it("fetches the open tab first, with status and limit", async () => {
        const requests = mockApi(() => reportListReply([reportFixture()]));
        renderReports();
        await waitFor(() => expect(rowsOf()).toHaveLength(1));
        expect(requests[0].params).toEqual({status: "open", limit: PAGE_SIZE});
    });

    it("links both avatars to the user pages", async () => {
        const report = reportFixture();
        mockApi(() => reportListReply([report]));
        const {router, user} = renderReports();
        await waitFor(() => expect(rowsOf()).toHaveLength(1));
        const links = within(rowsOf()[0]).getAllByRole("link", {name: "查看用戶"});
        expect(links.map(link => link.getAttribute("href"))).toEqual([`/users/${report.target.id}`, `/users/${report.reporter_id}`]);
        await user.click(links[0]);
        expect(router.state.location.pathname).toBe(`/users/${report.target.id}`);
    });

    it("treats an invalid ?status as open without rewriting the URL", async () => {
        const requests = mockApi(() => reportListReply([reportFixture()]));
        const {router} = renderReports("/reports?status=foo");
        await waitFor(() => expect(rowsOf()).toHaveLength(1));
        expect(requests[0].params.status).toBe("open");
        expect(router.state.location.search).toBe("?status=foo");
    });

    it("starts on All for ?status=all", async () => {
        const requests = mockApi(() => reportListReply([]));
        renderReports("/reports?status=all");
        await screen.findByText("尚無任何舉報");
        expect(requests[0].params.status).toBe("all");
    });

    it("shows the open empty text", async () => {
        mockApi(() => reportListReply([]));
        renderReports();
        expect(await screen.findByText("沒有待處理舉報")).toBeInTheDocument();
    });

    it("clears the old tab, then refetches with status=all and updates the URL", async () => {
        const gate = deferred();
        const open = reportFixture({reason: "spam"});
        const all = reportFixture({reason: "other"});
        const requests = mockApi(request => (request.params.status === "all" ? gate.promise : reportListReply([open])));
        const {router, user} = renderReports();
        await screen.findByText("垃圾訊息");
        await user.click(screen.getByRole("tab", {name: "全部"}));
        expect(screen.queryByText("垃圾訊息")).not.toBeInTheDocument();
        expect(router.state.location.search).toBe("?status=all");
        expect(requests.at(-1)?.params.status).toBe("all");
        gate.resolve(reportListReply([all]));
        expect(await screen.findByText("其他")).toBeInTheDocument();
    });

    it("drops a slow response from the previous tab", async () => {
        const slowOpen = deferred();
        const all = reportFixture({reason: "other"});
        mockApi(request => (request.params.status === "open" ? slowOpen.promise : reportListReply([all])));
        const {user} = renderReports();
        await user.click(screen.getByRole("tab", {name: "全部"}));
        await screen.findByText("其他");
        slowOpen.resolve(reportListReply([reportFixture({reason: "spam"})]));
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(screen.queryByText("垃圾訊息")).not.toBeInTheDocument();
        expect(screen.getByText("其他")).toBeInTheDocument();
    });

    it("loads more with the last id, appends, and hides the button at has_more=false", async () => {
        const first = [reportFixture(), reportFixture()];
        const second = [reportFixture()];
        const requests = mockApi(request => (request.params.before ? reportListReply(second, false) : reportListReply(first, true)));
        const {user} = renderReports();
        await waitFor(() => expect(rowsOf()).toHaveLength(2));
        await user.click(screen.getByRole("button", {name: "載入更多"}));
        await waitFor(() => expect(rowsOf()).toHaveLength(3));
        expect(requests.at(-1)?.params).toEqual({status: "open", before: first[1].id, limit: PAGE_SIZE});
        expect(screen.queryByRole("button", {name: "載入更多"})).not.toBeInTheDocument();
    });

    it("keeps rows on load-more failure and retries with the same cursor", async () => {
        const first = [reportFixture(), reportFixture()];
        let fail = true;
        const requests = mockApi(request => {
            if (!request.params.before) return reportListReply(first, true);
            return fail ? {status: 500, data: errorBody("INTERNAL")} : reportListReply([reportFixture()], false);
        });
        const {user} = renderReports();
        await waitFor(() => expect(rowsOf()).toHaveLength(2));
        await user.click(screen.getByRole("button", {name: "載入更多"}));
        expect(await screen.findByText("載入更多失敗")).toBeInTheDocument();
        expect(rowsOf()).toHaveLength(2);
        fail = false;
        await user.click(screen.getByRole("button", {name: "重試"}));
        await waitFor(() => expect(rowsOf()).toHaveLength(3));
        const cursors = requests.filter(request => request.params.before).map(request => request.params.before);
        expect(cursors).toEqual([first[1].id, first[1].id]);
    });

    it("keeps old rows while refreshing", async () => {
        const gate = deferred();
        let calls = 0;
        mockApi(() => (++calls === 1 ? reportListReply([reportFixture({reason: "spam"})]) : gate.promise));
        const {user} = renderReports();
        await screen.findByText("垃圾訊息");
        await user.click(screen.getByRole("button", {name: "重新整理"}));
        expect(screen.getByText("垃圾訊息")).toBeInTheDocument();
        gate.resolve(reportListReply([reportFixture({reason: "other"})]));
        expect(await screen.findByText("其他")).toBeInTheDocument();
        expect(screen.queryByText("垃圾訊息")).not.toBeInTheDocument();
    });

    it("keeps old rows and shows an ErrorCard when refresh fails", async () => {
        let calls = 0;
        mockApi(() => (++calls === 1 ? reportListReply([reportFixture({reason: "spam"})]) : {status: 500, data: errorBody("INTERNAL")}));
        const {user} = renderReports();
        await screen.findByText("垃圾訊息");
        await user.click(screen.getByRole("button", {name: "重新整理"}));
        expect(await screen.findByRole("alert")).toHaveTextContent("伺服器錯誤，請稍後再試");
        expect(screen.getByText("垃圾訊息")).toBeInTheDocument();
    });

    it("shows an ErrorCard on first-load failure, with tabs still usable", async () => {
        mockNetworkError();
        renderReports();
        expect(await screen.findByRole("alert")).toHaveTextContent("無法連線至伺服器");
        expect(screen.getByRole("tab", {name: "全部"})).toBeEnabled();
    });

    it("marks repeat offenders at 3 open reports, not at 2", async () => {
        const base = reportFixture().target;
        mockApi(() => reportListReply([reportFixture({target: {...base, open_reports: 3}}), reportFixture({target: {...base, open_reports: 2}})]));
        renderReports();
        await waitFor(() => expect(rowsOf()).toHaveLength(2));
        const [hot, cold] = rowsOf();
        expect(within(hot).getByText("3")).toHaveClass("text-red-700", "font-bold");
        expect(within(cold).getByText("2")).not.toHaveClass("text-red-700");
    });

    it("links each row to /reports/<id> with a real anchor", async () => {
        const item: ReportItem = reportFixture();
        mockApi(() => reportListReply([item]));
        renderReports();
        const link = await screen.findByRole("link", {name: `開啟舉報 ${item.id.slice(-8)}`});
        expect(link).toHaveAttribute("href", `/reports/${item.id}`);
    });
});

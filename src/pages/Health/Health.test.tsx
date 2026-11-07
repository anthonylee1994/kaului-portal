import React from "react";
import {act, fireEvent, render, screen, within} from "@testing-library/react";
import {createMemoryRouter, RouterProvider} from "react-router";
import {AdminShell} from "@/components/AdminShell";
import {sessionStore} from "@/session/sessionStore";
import {errorBody, failedJobFixture, failedJobsReply, metricsReply, mockApi, type MockReply, type RecordedRequest} from "@/test/mockApi";
import type {FailedJobItem} from "@/api/types";
import {Health} from "./index";

function renderPage(strict = false) {
    const router = createMemoryRouter(
        [
            {
                element: <AdminShell />,
                children: [{path: "/health", element: <Health />}],
            },
            {path: "/login", element: <p>login</p>},
        ],
        {initialEntries: ["/health"]}
    );
    const tree = <RouterProvider router={router} />;
    render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree);
    return router;
}

// Lets pending promises settle without moving the clock.
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

const metricsCalls = (requests: RecordedRequest[]) => requests.filter(r => r.url === "/admin/metrics");
const failedCalls = (requests: RecordedRequest[]) => requests.filter(r => r.url === "/admin/jobs/failed");

function backend(handlers: {metrics?: () => MockReply; failed?: () => MockReply}) {
    return mockApi(request => (request.url === "/admin/metrics" ? (handlers.metrics ?? (() => metricsReply()))() : (handlers.failed ?? (() => failedJobsReply([])))()));
}

let overflowing = false;

beforeEach(() => {
    vi.useFakeTimers();
    sessionStore.setState({token: "t", logoutReason: null});
    overflowing = false;
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {configurable: true, get: () => (overflowing ? 100 : 0)});
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {configurable: true, get: () => (overflowing ? 20 : 0)});
});

afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
    Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
});

describe("page", () => {
    it("loads the four cards and the failed jobs table", async () => {
        backend({failed: () => failedJobsReply([failedJobFixture({kind: "push.send"})])});
        renderPage();
        expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
        await flush();
        for (const name of ["概覽", "DB", "Jobs", "限流", "失敗任務（dead-letter）"]) {
            expect(screen.getByRole("heading", {name})).toBeInTheDocument();
        }
        expect(screen.getByText("push.send")).toBeInTheDocument();
        expect(screen.getByText("不足 1 分鐘")).toBeInTheDocument();
    });

    it("still loads under StrictMode's mount-cleanup-mount", async () => {
        backend({});
        renderPage(true);
        await flush();
        expect(screen.getByRole("heading", {name: "概覽"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "重新整理"})).toBeEnabled();
    });

    it("highlights the nav item for /health", async () => {
        backend({});
        renderPage();
        await flush();
        expect(screen.getByRole("link", {name: "系統健康"})).toHaveAttribute("aria-current", "page");
    });

    it("shows the elapsed time since the last success", async () => {
        backend({});
        renderPage();
        await flush();
        expect(screen.getByText("更新於 0 秒前")).toBeInTheDocument();
        await advance(5000);
        expect(screen.getByText("更新於 5 秒前")).toBeInTheDocument();
    });

    it("polls both endpoints every 15 seconds", async () => {
        const requests = backend({});
        renderPage();
        await flush();
        await advance(15_000);
        expect(metricsCalls(requests)).toHaveLength(2);
        expect(failedCalls(requests)).toHaveLength(2);
    });

    it("never sends anything but GET", async () => {
        const requests = backend({});
        renderPage();
        await advance(30_000);
        expect(requests.every(r => r.method === "GET")).toBe(true);
    });
});

describe("errors", () => {
    it("shows an ErrorCard for a failed first load, polling continues, retry recovers; failed jobs are unaffected", async () => {
        let fail = true;
        const requests = backend({metrics: () => (fail ? {status: 500, data: errorBody("INTERNAL"), headers: {"X-Request-Id": "req-1"}} : metricsReply())});
        renderPage();
        await flush();
        expect(screen.getByRole("alert")).toHaveTextContent("req-1");
        expect(screen.getByText("無失敗任務")).toBeInTheDocument();
        await advance(15_000);
        expect(metricsCalls(requests)).toHaveLength(2);
        fail = false;
        fireEvent.click(screen.getByRole("button", {name: "重試"}));
        await flush();
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByRole("heading", {name: "限流"})).toBeInTheDocument();
    });

    it("shows an ErrorCard only in the failed jobs block when that endpoint fails", async () => {
        backend({failed: () => ({status: 500, data: errorBody("INTERNAL")})});
        renderPage();
        await flush();
        expect(screen.getAllByRole("alert")).toHaveLength(1);
        expect(screen.getByRole("heading", {name: "概覽"})).toBeInTheDocument();
    });

    it("keeps old data and shows a stale note when a later refresh fails, then clears it", async () => {
        let fail = false;
        backend({metrics: () => (fail ? {status: 500, data: errorBody("INTERNAL")} : metricsReply({uptime_secs: 90061}))});
        renderPage();
        await flush();
        fail = true;
        await advance(15_000);
        expect(screen.getByRole("status")).toHaveTextContent("更新失敗，目前顯示的是 15 秒前的數據");
        expect(screen.getByText("1 日 1 時")).toBeInTheDocument();
        expect(screen.queryByRole("alert")).toBeNull();
        fail = false;
        await advance(15_000);
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("stops polling after a 401", async () => {
        let unauthorized = false;
        const requests = backend({metrics: () => (unauthorized ? {status: 401, data: errorBody("UNAUTHENTICATED")} : metricsReply())});
        renderPage();
        await flush();
        unauthorized = true;
        await advance(15_000);
        expect(sessionStore.getState().token).toBeNull();
        expect(metricsCalls(requests)).toHaveLength(2);
        await advance(60_000);
        expect(metricsCalls(requests)).toHaveLength(2);
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("skips ticks during Retry-After after a 429, then resumes", async () => {
        let limited = false;
        const requests = backend({metrics: () => (limited ? {status: 429, data: errorBody("RATE_LIMITED"), headers: {"Retry-After": "60"}} : metricsReply())});
        renderPage();
        await flush();
        limited = true;
        await advance(15_000); // 2nd request, answered 429 -> paused until t = 75 s
        limited = false;
        await advance(45_000); // ticks at 30 / 45 / 60 s are skipped
        expect(metricsCalls(requests)).toHaveLength(2);
        await advance(15_000);
        expect(metricsCalls(requests)).toHaveLength(3);
    });

    it("pauses while the tab is hidden and refetches on return", async () => {
        const requests = backend({});
        renderPage();
        await flush();
        Object.defineProperty(document, "hidden", {configurable: true, get: () => true});
        act(() => void document.dispatchEvent(new Event("visibilitychange")));
        await advance(60_000);
        expect(metricsCalls(requests)).toHaveLength(1);
        Object.defineProperty(document, "hidden", {configurable: true, get: () => false});
        await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
        expect(metricsCalls(requests)).toHaveLength(2);
    });
});

describe("refresh button", () => {
    it("refreshes both blocks once and is disabled while a request is in flight", async () => {
        let release!: (reply: MockReply) => void;
        let hold = false;
        const requests = mockApi(request => {
            if (request.url === "/admin/metrics") return hold ? new Promise<MockReply>(resolve => (release = resolve)) : metricsReply();
            return failedJobsReply([]);
        });
        renderPage();
        await flush();
        const button = screen.getByRole("button", {name: "重新整理"});
        expect(button).toBeEnabled();
        hold = true;
        fireEvent.click(button);
        await flush();
        expect(screen.getByRole("button", {name: "重新整理"})).toBeDisabled();
        fireEvent.click(screen.getByRole("button", {name: "重新整理"}));
        expect(metricsCalls(requests)).toHaveLength(2);
        expect(failedCalls(requests)).toHaveLength(2);
        await act(async () => release(metricsReply()));
        expect(screen.getByRole("button", {name: "重新整理"})).toBeEnabled();
    });
});

describe("cards", () => {
    it("flags sqlite busy and failed jobs in red with a warning mark and screen-reader text", async () => {
        backend({metrics: () => metricsReply({db: {sqlite_busy_total: 2}, jobs: {failed_total: 3}})});
        renderPage();
        await flush();
        expect(screen.getAllByText("異常")).toHaveLength(2);
        const busy = screen.getByText("SQLite busy").parentElement as HTMLElement;
        expect(within(busy).getByText("2").closest("dd")).toHaveClass("text-red-700");
    });

    it("leaves a clean metrics reply uncoloured and does not colour 5xx", async () => {
        backend({metrics: () => metricsReply({http: {responses_5xx_total: 9}})});
        renderPage();
        await flush();
        expect(screen.queryByText("異常")).toBeNull();
        expect(screen.queryByText("注意")).toBeNull();
        expect(screen.getByText("5xx 總數").nextElementSibling).toHaveTextContent("9");
        expect(screen.getByText("5xx 總數").nextElementSibling).not.toHaveClass("text-red-700");
    });

    it("renders jobs oldest age and histogram integers; empty histograms show a dash", async () => {
        backend({
            metrics: () =>
                metricsReply({
                    jobs: {oldest_ready_age_ms: 2500, latency_ms: {count: 4, p50: 5, p95: 25, p99: 100, max: 1500}},
                }),
        });
        renderPage();
        await flush();
        expect(screen.getByText("2.5 秒")).toBeInTheDocument();
        expect(screen.getByText("1500")).toBeInTheDocument();
        // db.write_wait_ms has count 0 in the fixture
        const db = screen.getByRole("region", {name: "DB"});
        expect(within(db).getAllByText("—")).toHaveLength(4);
    });

    it("shows a dash when nothing is waiting", async () => {
        backend({});
        renderPage();
        await flush();
        const oldest = screen.getByText("最舊待處理").nextElementSibling;
        expect(oldest).toHaveTextContent("—");
    });

    it("renders limiter keys dynamically, sorted, colouring only the known ones", async () => {
        backend({metrics: () => metricsReply({http: {rate_limited_total: {custom_x: 7, api: 0, admin_fail: 2}}})});
        renderPage();
        await flush();
        const card = screen.getByRole("region", {name: "限流"});
        expect(Array.from(card.querySelectorAll("dt")).map(node => node.textContent)).toEqual(["admin_fail", "api", "custom_x"]);
        expect(within(card).getByText("有人嘗試猜測令牌")).toBeInTheDocument();
        expect(card.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
        expect(screen.getByText("custom_x").nextElementSibling).not.toHaveClass("text-amber-700");
    });

    it("shows a note for no limiter keys and a dash for non-finite values without throwing", async () => {
        backend({metrics: () => metricsReply({http: {rate_limited_total: {}}})});
        renderPage();
        await flush();
        expect(screen.getByText("無限流紀錄")).toBeInTheDocument();
    });

    it("renders a non-numeric limiter value as a dash", async () => {
        backend({metrics: () => metricsReply({http: {rate_limited_total: {api: "oops" as unknown as number}}})});
        renderPage();
        await flush();
        expect(screen.getByText("api").nextElementSibling).toHaveTextContent("—");
    });
});

describe("failed jobs table", () => {
    function setFailed(items: FailedJobItem[], failedTotal = items.length) {
        return backend({metrics: () => metricsReply({jobs: {failed_total: failedTotal}}), failed: () => failedJobsReply(items)});
    }

    it("renders columns, absolute and relative time, and a dash for a null error", async () => {
        setFailed([failedJobFixture({kind: "mail.send", attempts: 3, last_error: null})]);
        renderPage();
        await flush();
        expect(screen.getByRole("columnheader", {name: "最後錯誤"})).toBeInTheDocument();
        const row = screen.getByText("mail.send").closest("tr") as HTMLElement;
        expect(within(row).getByText("3")).toBeInTheDocument();
        expect(within(row).getByText("—")).toBeInTheDocument();
        expect(row.querySelector("time")).toHaveTextContent(/\d{4}-\d{2}-\d{2} .*（/);
        expect(within(row).queryByRole("button")).toBeNull();
    });

    it("offers expand only when the error overflows, and toggles aria-expanded", async () => {
        setFailed([failedJobFixture({last_error: "short"})]);
        renderPage();
        await flush();
        expect(screen.queryByRole("button", {name: "展開"})).toBeNull();
    });

    it("expands and collapses an overflowing error", async () => {
        overflowing = true;
        setFailed([failedJobFixture({last_error: "line1\nline2\nline3"})]);
        renderPage();
        await flush();
        const toggle = screen.getByRole("button", {name: "展開"});
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        fireEvent.click(toggle);
        expect(screen.getByRole("button", {name: "收起"})).toHaveAttribute("aria-expanded", "true");
        fireEvent.click(screen.getByRole("button", {name: "收起"}));
        expect(screen.getByRole("button", {name: "展開"})).toHaveAttribute("aria-expanded", "false");
    });

    it("keeps an expanded row open across a polling refresh", async () => {
        overflowing = true;
        setFailed([failedJobFixture({id: "job-1", last_error: "line1\nline2\nline3"})]);
        renderPage();
        await flush();
        fireEvent.click(screen.getByRole("button", {name: "展開"}));
        await advance(15_000);
        expect(screen.getByRole("button", {name: "收起"})).toHaveAttribute("aria-expanded", "true");
    });

    it("shows the empty state", async () => {
        setFailed([]);
        renderPage();
        await flush();
        expect(screen.getByText("無失敗任務")).toBeInTheDocument();
        expect(screen.queryByText(/僅顯示最近/)).toBeNull();
    });

    it("explains when the table holds fewer rows than the cumulative counter", async () => {
        setFailed([failedJobFixture()], 5);
        renderPage();
        await flush();
        expect(screen.getByText("僅顯示最近 1 筆（累計失敗 5）")).toBeInTheDocument();
    });

    it("renders HTML in last_error as plain text", async () => {
        setFailed([failedJobFixture({last_error: "<b>bold</b>"})]);
        renderPage();
        await flush();
        expect(screen.getByText("<b>bold</b>")).toBeInTheDocument();
        expect(document.querySelector("b")).toBeNull();
    });
});

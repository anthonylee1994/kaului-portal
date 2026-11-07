import {sessionStore} from "@/session/sessionStore";
import {errorBody, mockApi, reportFixture, reportListReply} from "@/test/mockApi";
import {banFromReport, dismissReport, getReport, listReports} from "./reports";

beforeEach(() => {
    sessionStore.setState({token: "t", logoutReason: null});
});

describe("listReports", () => {
    it("sends status, before and limit as query params", async () => {
        const requests = mockApi(() => reportListReply([]));
        await listReports({status: "all", before: "abc", limit: 2});
        expect(requests[0].params).toEqual({status: "all", before: "abc", limit: 2});
    });

    it("omits before when it is missing", async () => {
        const requests = mockApi(() => reportListReply([]));
        await listReports({status: "open"});
        expect(requests[0].params.status).toBe("open");
        expect(requests[0].params.before).toBeUndefined();
    });

    it("logs out on 401 while logged in", async () => {
        mockApi(() => ({status: 401, data: errorBody("UNAUTHENTICATED")}));
        await expect(listReports({status: "open"})).rejects.toMatchObject({status: 401});
        expect(sessionStore.getState().token).toBeNull();
    });
});

describe("getReport", () => {
    it("requests /admin/reports/<id>", async () => {
        const requests = mockApi(() => ({status: 200, data: reportFixture()}));
        await getReport("abc");
        expect(requests[0].url).toBe("/admin/reports/abc");
    });

    it("encodes special characters in the id", async () => {
        const requests = mockApi(() => ({status: 200, data: reportFixture()}));
        await getReport("a/b?c#d");
        expect(requests[0].url).toBe("/admin/reports/a%2Fb%3Fc%23d");
    });

    it("logs out on 401 while logged in", async () => {
        mockApi(() => ({status: 401, data: errorBody("UNAUTHENTICATED")}));
        await expect(getReport("abc")).rejects.toMatchObject({status: 401});
        expect(sessionStore.getState().token).toBeNull();
    });

    it("does not log out on 404", async () => {
        mockApi(() => ({status: 404, data: errorBody("NOT_FOUND")}));
        await expect(getReport("abc")).rejects.toMatchObject({status: 404});
        expect(sessionStore.getState().token).toBe("t");
    });
});

describe.each([
    ["dismissReport", dismissReport, "dismiss"],
    ["banFromReport", banFromReport, "ban"],
] as const)("%s", (_name, call, action) => {
    it(`POSTs /admin/reports/<id>/${action} and encodes the id`, async () => {
        const requests = mockApi(() => ({status: 200, data: {}}));
        await call("a/b?c#d");
        expect(requests[0].method).toBe("POST");
        expect(requests[0].url).toBe(`/admin/reports/a%2Fb%3Fc%23d/${action}`);
    });

    it("sends {} without a note and only {note} with one", async () => {
        const requests = mockApi(() => ({status: 200, data: {}}));
        await call("abc");
        await call("abc", "  why  ");
        expect(requests[0].body).toEqual({});
        expect(requests[1].body).toEqual({note: "why"});
    });

    it("logs out on 401 but not on 404", async () => {
        mockApi(() => ({status: 404, data: errorBody("NOT_FOUND")}));
        await expect(call("abc")).rejects.toMatchObject({status: 404});
        expect(sessionStore.getState().token).toBe("t");
        mockApi(() => ({status: 401, data: errorBody("UNAUTHENTICATED")}));
        await expect(call("abc")).rejects.toMatchObject({status: 401});
        expect(sessionStore.getState().token).toBeNull();
    });
});

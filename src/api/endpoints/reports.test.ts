import {sessionStore} from "@/session/sessionStore";
import {errorBody, mockApi, reportListReply} from "@/test/mockApi";
import {listReports} from "./reports";

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

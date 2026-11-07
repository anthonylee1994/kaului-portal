import {sessionStore} from "@/session/sessionStore";
import {errorBody, failedJobsReply, mockApi} from "@/test/mockApi";
import {getFailedJobs} from "./jobs";

beforeEach(() => {
    sessionStore.setState({token: "t", logoutReason: null});
});

describe("getFailedJobs", () => {
    it("requests /admin/jobs/failed with limit=50 and the store token", async () => {
        const requests = mockApi(() => failedJobsReply([]));
        await getFailedJobs();
        expect(requests[0]).toMatchObject({method: "GET", url: "/admin/jobs/failed", params: {limit: 50}, authorization: "Bearer t"});
    });

    it("lets the caller override the limit", async () => {
        const requests = mockApi(() => failedJobsReply([]));
        await getFailedJobs(10);
        expect(requests[0].params).toEqual({limit: 10});
    });

    it("logs out on 401", async () => {
        mockApi(() => ({status: 401, data: errorBody("UNAUTHENTICATED")}));
        await expect(getFailedJobs()).rejects.toMatchObject({status: 401});
        expect(sessionStore.getState().token).toBeNull();
    });
});

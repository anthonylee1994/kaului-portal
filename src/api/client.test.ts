import {errorBody, metricsFixture, mockApi} from "@/test/mockApi";
import {sessionStore} from "@/session/sessionStore";
import {getMetrics} from "./endpoints/metrics";
import * as rateLimit from "./notifyRateLimited";

beforeEach(() => {
    sessionStore.setState({token: null, logoutReason: null});
});

describe("apiClient interceptors", () => {
    it("adds the Bearer header when logged in", async () => {
        const requests = mockApi(() => ({status: 200, data: metricsFixture}));
        sessionStore.setState({token: "stored"});
        await getMetrics();
        expect(requests[0].authorization).toBe("Bearer stored");
    });

    it("does not override an explicit Authorization header", async () => {
        const requests = mockApi(() => ({status: 200, data: metricsFixture}));
        sessionStore.setState({token: "stored"});
        await getMetrics({token: "probe"});
        expect(requests[0].authorization).toBe("Bearer probe");
    });

    it("logs out with reason expired on 401 for a normal request", async () => {
        mockApi(() => ({status: 401, data: errorBody("UNAUTHENTICATED")}));
        sessionStore.setState({token: "stored"});
        await expect(getMetrics()).rejects.toMatchObject({status: 401});
        expect(sessionStore.getState().token).toBeNull();
        expect(sessionStore.getState().logoutReason).toBe("expired");
    });

    it("raises the global rate-limit toast on a normal 429", async () => {
        const spy = vi.spyOn(rateLimit, "notifyRateLimited").mockImplementation(() => {});
        mockApi(() => ({status: 429, data: errorBody("RATE_LIMITED"), headers: {"Retry-After": "12"}}));
        sessionStore.setState({token: "stored"});
        await expect(getMetrics()).rejects.toMatchObject({status: 429, retryAfter: 12});
        expect(spy).toHaveBeenCalledTimes(1);
        expect(sessionStore.getState().token).toBe("stored");
    });

    it("does not toast a 429 from the login probe", async () => {
        const spy = vi.spyOn(rateLimit, "notifyRateLimited").mockImplementation(() => {});
        mockApi(() => ({status: 429, data: errorBody("RATE_LIMITED")}));
        await expect(getMetrics({token: "probe"})).rejects.toMatchObject({status: 429});
        expect(spy).not.toHaveBeenCalled();
    });

    it("does not raise the rate-limit toast for other errors", async () => {
        const spy = vi.spyOn(rateLimit, "notifyRateLimited").mockImplementation(() => {});
        mockApi(() => ({status: 500, data: errorBody("INTERNAL")}));
        await expect(getMetrics()).rejects.toMatchObject({status: 500});
        expect(spy).not.toHaveBeenCalled();
    });

    it("does not log out when the login probe gets 401", async () => {
        mockApi(() => ({status: 401, data: errorBody("UNAUTHENTICATED")}));
        sessionStore.setState({token: "stored"});
        await expect(getMetrics({token: "wrong"})).rejects.toMatchObject({
            status: 401,
        });
        expect(sessionStore.getState().token).toBe("stored");
        expect(sessionStore.getState().logoutReason).toBeNull();
    });
});

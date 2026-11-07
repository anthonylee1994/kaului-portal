import {errorBody, metricsFixture, mockApi} from "@/test/mockApi";
import {sessionStore} from "@/session/sessionStore";
import {getMetrics} from "./endpoints/metrics";

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

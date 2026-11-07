import {ApiError} from "@/api/errors";
import {errorBody, metricsFixture, mockApi, mockNetworkError} from "@/test/mockApi";
import {sessionStore} from "./sessionStore";

const KEY = "kaului.portal.token";

beforeEach(() => {
    sessionStore.setState({token: null, logoutReason: null});
});

describe("sessionStore.login", () => {
    it("stores the token in the store and sessionStorage on 200", async () => {
        const requests = mockApi(() => ({status: 200, data: metricsFixture}));
        await sessionStore.getState().login("  good-token  ");
        expect(sessionStore.getState().token).toBe("good-token");
        expect(sessionStorage.getItem(KEY)).toBe("good-token");
        expect(requests[0].authorization).toBe("Bearer good-token");
    });

    it("clears logoutReason on success", async () => {
        mockApi(() => ({status: 200, data: metricsFixture}));
        sessionStore.setState({logoutReason: "expired"});
        await sessionStore.getState().login("good-token");
        expect(sessionStore.getState().logoutReason).toBeNull();
    });

    it.each([
        [401, {x: "y"}],
        [404, {x: "y"}],
        [429, {"retry-after": "30"}],
    ])("throws ApiError and writes nothing on %i", async (status, headers) => {
        mockApi(() => ({status, data: errorBody("X"), headers}));
        await expect(sessionStore.getState().login("bad")).rejects.toMatchObject({
            status,
        });
        expect(sessionStore.getState().token).toBeNull();
        expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it("throws and writes nothing on a network error", async () => {
        mockNetworkError();
        await expect(sessionStore.getState().login("bad")).rejects.toBeInstanceOf(ApiError);
        expect(sessionStore.getState().token).toBeNull();
        expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it("does not send a request for an empty token", async () => {
        const requests = mockApi(() => ({status: 200, data: metricsFixture}));
        await expect(sessionStore.getState().login("   ")).rejects.toBeInstanceOf(ApiError);
        expect(requests).toHaveLength(0);
    });
});

describe("sessionStore.logout", () => {
    it("clears the store and sessionStorage", () => {
        sessionStorage.setItem(KEY, "t");
        sessionStore.setState({token: "t"});
        sessionStore.getState().logout();
        expect(sessionStore.getState().token).toBeNull();
        expect(sessionStorage.getItem(KEY)).toBeNull();
        expect(sessionStore.getState().logoutReason).toBeNull();
    });

    it("sets logoutReason when expired", () => {
        sessionStore.setState({token: "t"});
        sessionStore.getState().logout({reason: "expired"});
        expect(sessionStore.getState().logoutReason).toBe("expired");
    });
});

it("never writes to localStorage", async () => {
    mockApi(() => ({status: 200, data: metricsFixture}));
    await sessionStore.getState().login("good-token");
    expect(localStorage.length).toBe(0);
});

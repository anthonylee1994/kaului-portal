import {sessionStore} from "@/session/sessionStore";
import {adminUserFixture, errorBody, mockApi} from "@/test/mockApi";
import {banUser, getUser, unbanUser} from "./users";

beforeEach(() => {
    sessionStore.setState({token: "t", logoutReason: null});
});

describe("getUser", () => {
    it("requests /admin/users/<id> and encodes the id", async () => {
        const requests = mockApi(() => ({status: 200, data: adminUserFixture()}));
        await getUser("abc");
        await getUser("a/b?c#d");
        expect(requests[0]).toMatchObject({method: "GET", url: "/admin/users/abc"});
        expect(requests[1].url).toBe("/admin/users/a%2Fb%3Fc%23d");
    });

    it("logs out on 401 but not on 404", async () => {
        mockApi(() => ({status: 404, data: errorBody("NOT_FOUND")}));
        await expect(getUser("abc")).rejects.toMatchObject({status: 404});
        expect(sessionStore.getState().token).toBe("t");
        mockApi(() => ({status: 401, data: errorBody("UNAUTHENTICATED")}));
        await expect(getUser("abc")).rejects.toMatchObject({status: 401});
        expect(sessionStore.getState().token).toBeNull();
    });
});

describe.each([
    ["ban", banUser, "banned"],
    ["unban", unbanUser, "active"],
] as const)("%s", (name, call, status) => {
    it("posts to the user-scoped endpoint with an empty body when there is no note", async () => {
        const requests = mockApi(() => ({status: 200, data: {status}}));
        await expect(call("a/b")).resolves.toEqual({status});
        expect(requests[0]).toMatchObject({method: "POST", url: `/admin/users/a%2Fb/${name}`, body: {}});
    });

    it("sends only the trimmed note", async () => {
        const requests = mockApi(() => ({status: 200, data: {status}}));
        await call("abc", "  why  ");
        expect(requests[0].body).toEqual({note: "why"});
    });

    it("logs out on 401 and not on 404", async () => {
        mockApi(() => ({status: 404, data: errorBody("NOT_FOUND")}));
        await expect(call("abc")).rejects.toMatchObject({status: 404});
        expect(sessionStore.getState().token).toBe("t");
        mockApi(() => ({status: 401, data: errorBody("UNAUTHENTICATED")}));
        await expect(call("abc")).rejects.toMatchObject({status: 401});
        expect(sessionStore.getState().token).toBeNull();
    });
});

import React from "react";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createMemoryRouter, RouterProvider} from "react-router";
import {UserLookupForm} from "./UserLookupForm";

function setup() {
    const router = createMemoryRouter(
        [
            {path: "/", element: <UserLookupForm tone="light" />},
            {path: "/users/:id", element: <UserLookupForm tone="light" />},
        ],
        {initialEntries: ["/"]}
    );
    render(<RouterProvider router={router} />);
    return {router, user: userEvent.setup(), input: screen.getByRole("textbox", {name: "使用者編號查詢"}) as HTMLInputElement};
}

describe("UserLookupForm", () => {
    it("trims the id, navigates on Enter and keeps the input", async () => {
        const {router, user, input} = setup();
        await user.type(input, "  abc  {Enter}");
        expect(router.state.location.pathname).toBe("/users/abc");
        expect(input).toHaveValue("  abc  ");
    });

    it("navigates on the button too", async () => {
        const {router, user, input} = setup();
        await user.type(input, "abc");
        await user.click(screen.getByRole("button", {name: "查詢"}));
        expect(router.state.location.pathname).toBe("/users/abc");
    });

    it("does not navigate for an empty or blank id", async () => {
        const {router, user, input} = setup();
        await user.type(input, "{Enter}");
        await user.type(input, "   {Enter}");
        expect(router.state.location.pathname).toBe("/");
    });

    it("encodes the id so it cannot leave /users/", async () => {
        const {router, user, input} = setup();
        await user.type(input, "../x{Enter}");
        expect(router.state.location.pathname).toBe("/users/..%2Fx");
        await user.clear(input);
        await user.type(input, "a/b{Enter}");
        expect(router.state.location.pathname).toBe("/users/a%2Fb");
    });
});

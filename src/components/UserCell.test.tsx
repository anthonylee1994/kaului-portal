import React from "react";
import {act, fireEvent, render, screen} from "@testing-library/react";
import {UserCell} from "./UserCell";

const ID = "0192f3a1-7c2e-7b4d-8a11-0123456789ab";

describe("UserCell", () => {
    it("shows the title and avatar, and copies the id when the title is clicked", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {value: {writeText}, configurable: true});
        const {container} = render(<UserCell id={ID} title="Hello" avatarUrl="https://img.example/a.jpg" />);
        expect(container.querySelector("img")).toHaveAttribute("src", "https://img.example/a.jpg");
        await act(async () => {
            fireEvent.click(screen.getByRole("button", {name: "複製 ID"}));
        });
        expect(screen.getByRole("button")).toHaveTextContent("已複製");
        expect(writeText).toHaveBeenCalledWith(ID);
    });

    it("falls back to the short id and a placeholder without title or avatar", () => {
        const {container} = render(<UserCell id={ID} title={null} avatarUrl={null} />);
        expect(screen.getByRole("button")).toHaveTextContent("456789ab");
        expect(container.querySelector("img")).toBeNull();
    });

    it("renders a title as plain text", () => {
        render(<UserCell id={ID} title="<b>x</b>" />);
        expect(screen.getByRole("button")).toHaveTextContent("<b>x</b>");
    });
});

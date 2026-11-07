import React from "react";
import {act, fireEvent, render, screen} from "@testing-library/react";
import {IdTag} from "./IdTag";

const ID = "0192f3a1-7c2e-7b4d-8a11-0123456789ab";

function mockClipboard(writeText: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, "clipboard", {value: {writeText}, configurable: true});
}

afterEach(() => {
    vi.useRealTimers();
});

describe("IdTag", () => {
    it("shows the last 8 characters, or the whole id when shorter", () => {
        const {rerender} = render(<IdTag id={ID} />);
        expect(screen.getByRole("button")).toHaveTextContent("456789ab");
        rerender(<IdTag id="abc" />);
        expect(screen.getByRole("button")).toHaveTextContent("abc");
    });

    it("shows the full id with `full`", () => {
        render(<IdTag id={ID} full />);
        expect(screen.getByRole("button")).toHaveTextContent(ID);
    });

    it("copies the full id, shows 已複製 and restores after 1.5s", async () => {
        vi.useFakeTimers();
        const writeText = vi.fn().mockResolvedValue(undefined);
        mockClipboard(writeText);
        render(<IdTag id={ID} />);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", {name: "複製 ID"}));
        });
        expect(writeText).toHaveBeenCalledWith(ID);
        expect(screen.getByRole("button")).toHaveTextContent("已複製");
        act(() => {
            vi.advanceTimersByTime(1500);
        });
        expect(screen.getByRole("button")).toHaveTextContent("456789ab");
    });

    it("stays silent when the copy is rejected", async () => {
        mockClipboard(vi.fn().mockRejectedValue(new Error("denied")));
        render(<IdTag id={ID} />);
        await act(async () => {
            fireEvent.click(screen.getByRole("button"));
        });
        expect(screen.getByRole("button")).toHaveTextContent("456789ab");
    });

    it("does not bubble the click to the parent", async () => {
        mockClipboard(vi.fn().mockResolvedValue(undefined));
        const onParentClick = vi.fn();
        render(
            <div onClick={onParentClick}>
                <IdTag id={ID} />
            </div>
        );
        await act(async () => {
            fireEvent.click(screen.getByRole("button"));
        });
        expect(onParentClick).not.toHaveBeenCalled();
    });

    it("shows the label instead of the id but still copies the id", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        mockClipboard(writeText);
        render(<IdTag id={ID} label="My title" />);
        expect(screen.getByRole("button")).toHaveTextContent("My title");
        await act(async () => {
            fireEvent.click(screen.getByRole("button", {name: "複製 ID"}));
        });
        expect(writeText).toHaveBeenCalledWith(ID);
    });
});

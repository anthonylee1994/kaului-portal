import React from "react";
import {fireEvent, render, screen} from "@testing-library/react";
import {SafeImage} from "./SafeImage";

const fallback = <span>fallback</span>;

function renderImage(src: string | null) {
    return render(<SafeImage src={src} alt="pic" fallback={fallback} />);
}

describe("SafeImage", () => {
    it.each(["https://example.com/a.png", "http://example.com/a.png"])("renders an <img> for %s", src => {
        renderImage(src);
        const image = screen.getByRole("img");
        expect(image).toHaveAttribute("src", src);
        expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
        expect(image).toHaveAttribute("loading", "lazy");
    });

    it.each(["javascript:alert(1)", "data:image/png;base64,AAAA", "/relative.png", "not a url", null])("renders the fallback for %s", src => {
        renderImage(src);
        expect(screen.getByText("fallback")).toBeInTheDocument();
        expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("switches to the fallback on error", () => {
        renderImage("https://example.com/a.png");
        fireEvent.error(screen.getByRole("img"));
        expect(screen.getByText("fallback")).toBeInTheDocument();
    });

    it("resets the error when src changes", () => {
        const {rerender} = renderImage("https://example.com/a.png");
        fireEvent.error(screen.getByRole("img"));
        rerender(<SafeImage src="https://example.com/b.png" alt="pic" fallback={fallback} />);
        expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.com/b.png");
    });
});

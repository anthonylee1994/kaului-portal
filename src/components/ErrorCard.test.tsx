import React from "react";
import {act, render, screen} from "@testing-library/react";
import {ApiError} from "@/api/errors";
import {ErrorCard} from "./ErrorCard";

function makeError(status: number | null, extra: Partial<{requestId: string | null; retryAfter: number | null; message: string}> = {}) {
    return new ApiError({message: extra.message ?? "boom", status, code: null, details: null, requestId: extra.requestId ?? null, retryAfter: extra.retryAfter ?? null});
}

afterEach(() => {
    vi.useRealTimers();
});

describe("ErrorCard", () => {
    it.each([
        [null, "無法連線至伺服器"],
        [429, "請求過多"],
        [500, "伺服器錯誤，請稍後再試"],
    ])("title for status %s", (status, title) => {
        render(<ErrorCard error={makeError(status)} />);
        expect(screen.getByRole("alert")).toHaveTextContent(title);
    });

    it("lets `title` override", () => {
        render(<ErrorCard error={makeError(500)} title="自訂" />);
        expect(screen.getByRole("alert")).toHaveTextContent("自訂");
    });

    it("shows the request id only when present, and never the backend message", () => {
        const {rerender} = render(<ErrorCard error={makeError(500, {message: "secret detail"})} />);
        expect(screen.queryByText(/Request ID/)).not.toBeInTheDocument();
        rerender(<ErrorCard error={makeError(500, {requestId: "req-1", message: "secret detail"})} />);
        expect(screen.getByText("Request ID:req-1")).toBeInTheDocument();
        expect(screen.queryByText(/secret detail/)).not.toBeInTheDocument();
    });

    it("counts down on 429 and disables retry until it reaches zero", () => {
        vi.useFakeTimers();
        const onRetry = vi.fn();
        render(<ErrorCard error={makeError(429, {retryAfter: 3})} onRetry={onRetry} />);
        expect(screen.getByText("3 秒後再試")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "重試"})).toBeDisabled();
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(screen.getByText("1 秒後再試")).toBeInTheDocument();
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(screen.queryByText(/秒後再試/)).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: "重試"})).toBeEnabled();
    });

    it("falls back to 60s when Retry-After is unreadable", () => {
        render(<ErrorCard error={makeError(429)} onRetry={() => {}} />);
        expect(screen.getByText("60 秒後再試")).toBeInTheDocument();
    });
});

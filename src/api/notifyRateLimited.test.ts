import {toast} from "@heroui/react";
import {ApiError} from "./errors";
import {notifyRateLimited} from "./notifyRateLimited";

function rateLimited(retryAfter: number | null) {
    return new ApiError({message: "HTTP 429", status: 429, code: null, details: null, requestId: null, retryAfter});
}

// Each test starts an hour later than the last, past any window the module-level state left open.
let epoch = Date.now();

beforeEach(() => {
    vi.useFakeTimers();
    epoch += 3_600_000;
    vi.setSystemTime(epoch);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("notifyRateLimited", () => {
    it("toasts with Retry-After as both text and timeout", () => {
        const spy = vi.spyOn(toast, "danger").mockReturnValue("1");
        notifyRateLimited(rateLimited(30));
        expect(spy).toHaveBeenCalledWith("請求太頻繁，請於 30 秒後再試", {timeout: 30_000});
    });

    it("falls back to 60 seconds without Retry-After", () => {
        const spy = vi.spyOn(toast, "danger").mockReturnValue("1");
        notifyRateLimited(rateLimited(null));
        expect(spy).toHaveBeenCalledWith("請求太頻繁，請於 60 秒後再試", {timeout: 60_000});
    });

    it("stays silent inside the window and toasts again after it", () => {
        const spy = vi.spyOn(toast, "danger").mockReturnValue("1");
        notifyRateLimited(rateLimited(10));
        vi.advanceTimersByTime(9_999);
        notifyRateLimited(rateLimited(10));
        expect(spy).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1);
        notifyRateLimited(rateLimited(10));
        expect(spy).toHaveBeenCalledTimes(2);
    });
});

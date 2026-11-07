import {formatAbsoluteTime, formatRelativeTime} from "./formatTime";

const NOW = new Date(2026, 10, 8, 12, 0, 0).getTime();
const ago = (ms: number) => NOW - ms;
const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

describe("formatRelativeTime", () => {
    it.each([
        [59 * S, "剛剛"],
        [60 * S, "1 分鐘前"],
        [59 * M, "59 分鐘前"],
        [60 * M, "1 小時前"],
        [23 * H, "23 小時前"],
        [24 * H, "1 日前"],
        [29 * D, "29 日前"],
    ])("%i ms ago", (diff, expected) => {
        expect(formatRelativeTime(ago(diff), NOW)).toBe(expected);
    });

    it("shows an absolute date from 30 days", () => {
        expect(formatRelativeTime(ago(30 * D), NOW)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("treats the future as just now", () => {
        expect(formatRelativeTime(NOW + 5 * M, NOW)).toBe("剛剛");
    });
});

describe("formatAbsoluteTime", () => {
    it("formats local time as YYYY-MM-DD HH:mm:ss", () => {
        expect(formatAbsoluteTime(new Date(2026, 10, 7, 14, 3, 21).getTime())).toBe("2026-11-07 14:03:21");
        expect(formatAbsoluteTime(new Date(2026, 0, 2, 0, 5, 9).getTime())).toBe("2026-01-02 00:05:09");
    });
});

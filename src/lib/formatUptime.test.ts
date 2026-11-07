import {formatUptime} from "./formatUptime";

describe("formatUptime", () => {
    it.each([
        [90061, "1 日 1 時"],
        [86400, "1 日 0 時"],
        [3720, "1 時 2 分"],
        [125, "2 分鐘"],
        [30, "不足 1 分鐘"],
        [0, "不足 1 分鐘"],
    ])("%s secs -> %s", (secs, expected) => {
        expect(formatUptime(secs)).toBe(expected);
    });

    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("%s -> dash", value => {
        expect(formatUptime(value)).toBe("—");
    });
});

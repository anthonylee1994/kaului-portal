import {formatDuration} from "./formatDuration";

describe("formatDuration", () => {
    it.each([
        [250, "250 ms"],
        [2500, "2.5 秒"],
        [59999, "59.9 秒"],
        [125000, "2 分 5 秒"],
    ])("%s ms -> %s", (ms, expected) => {
        expect(formatDuration(ms)).toBe(expected);
    });

    it.each([-1, Number.NaN])("%s -> dash", value => {
        expect(formatDuration(value)).toBe("—");
    });
});

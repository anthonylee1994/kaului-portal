import {safeRedirect} from "./safeRedirect";

describe("safeRedirect", () => {
    it("accepts a same-site path with a query", () => {
        expect(safeRedirect("/reports/abc?x=1")).toBe("/reports/abc?x=1");
    });

    it.each([
        ["null", null],
        ["empty", ""],
        ["protocol-relative", "//evil.com"],
        ["backslash", "/\\evil.com"],
        ["absolute url", "https://evil.com"],
        ["login", "/login"],
        ["login with query", "/login?redirect=/reports"],
        ["relative", "reports"],
    ])("falls back for %s", (_name, raw) => {
        expect(safeRedirect(raw)).toBe("/reports");
    });
});

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

interface Header {
    key: string;
    value: string;
}
const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8")) as {
    rewrites: {source: string; destination: string}[];
    headers: {source: string; headers: Header[]}[];
};
const headers = new Map(config.headers[0].headers.map(h => [h.key, h.value]));
const csp = headers.get("Content-Security-Policy") ?? "";
const directive = (name: string) =>
    csp
        .split(";")
        .map(part => part.trim())
        .find(part => part.startsWith(`${name} `)) ?? "";

describe("vercel.json", () => {
    it("rewrites every path to the SPA entry", () => {
        expect(config.rewrites).toContainEqual({source: "/(.*)", destination: "/index.html"});
    });

    it("sets the five security headers for all paths", () => {
        expect(config.headers[0].source).toBe("/(.*)");
        expect(headers.get("Referrer-Policy")).toBe("no-referrer");
        expect(headers.get("X-Frame-Options")).toBe("DENY");
        expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
        expect(csp).not.toBe("");
    });

    it("keeps the CSP strict", () => {
        expect(directive("default-src")).toBe("default-src 'self'");
        expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
        expect(directive("connect-src")).toBe("connect-src 'self' https://api.kaului.com");
        expect(csp).not.toContain("'unsafe-eval'");
        expect(directive("script-src")).not.toContain("'unsafe-inline'");
        expect(csp).not.toMatch(/\s\*(\s|;|$)/);
    });
});

describe("robots.txt", () => {
    it("disallows everything", () => {
        expect(fs.readFileSync(path.join(root, "public/robots.txt"), "utf8")).toContain("Disallow: /");
    });
});

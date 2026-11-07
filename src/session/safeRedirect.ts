const FALLBACK = "/reports";

// Only same-site absolute paths are allowed; anything else (protocol-relative, backslash tricks,
// full URLs, the login page itself) falls back to the reports queue.
export function safeRedirect(raw: string | null): string {
    if (!raw) return FALLBACK;
    if (!raw.startsWith("/")) return FALLBACK;
    if (raw.startsWith("//") || raw.startsWith("/\\")) return FALLBACK;
    const pathname = raw.split(/[?#]/)[0];
    if (pathname === "/login" || pathname === "/login/") return FALLBACK;
    return raw;
}

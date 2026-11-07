import {AxiosError, AxiosHeaders} from "axios";
import {normalizeError} from "./errors";

function axiosError(status: number, data: unknown, headers: Record<string, string> = {}) {
    const config = {
        headers: new AxiosHeaders({Authorization: "Bearer secret"}),
    };
    return new AxiosError(
        "failed",
        "ERR_BAD_REQUEST",
        config as never,
        {},
        {
            status,
            statusText: String(status),
            data,
            headers: new AxiosHeaders(headers),
            config: config as never,
        }
    );
}

describe("normalizeError", () => {
    it("reads code and message from a standard 401 body", () => {
        const error = normalizeError(
            axiosError(401, {
                error: {code: "UNAUTHENTICATED", message: "bad token"},
            })
        );
        expect(error.status).toBe(401);
        expect(error.code).toBe("UNAUTHENTICATED");
        expect(error.message).toBe("bad token");
    });

    it("keeps details.field on a 400", () => {
        const error = normalizeError(
            axiosError(400, {
                error: {
                    code: "VALIDATION_FAILED",
                    message: "too long",
                    details: {field: "note"},
                },
            })
        );
        expect(error.details).toEqual({field: "note"});
    });

    it("parses Retry-After into integer seconds", () => {
        const error = normalizeError(axiosError(429, errorBody429(), {"retry-after": "30"}));
        expect(error.retryAfter).toBe(30);
    });

    it("returns null when Retry-After is missing or not a number", () => {
        expect(normalizeError(axiosError(429, errorBody429())).retryAfter).toBeNull();
        expect(normalizeError(axiosError(429, errorBody429(), {"retry-after": "soon"})).retryAfter).toBeNull();
    });

    it("falls back to HTTP <status> for a non-JSON 5xx body", () => {
        const error = normalizeError(axiosError(502, "<html>bad gateway</html>"));
        expect(error.status).toBe(502);
        expect(error.code).toBeNull();
        expect(error.message).toBe("HTTP 502");
    });

    it("sets status to null when there is no response", () => {
        const error = normalizeError(new AxiosError("Network Error", "ERR_NETWORK"));
        expect(error.status).toBeNull();
    });

    it("keeps X-Request-Id", () => {
        const error = normalizeError(axiosError(500, "", {"x-request-id": "req-123"}));
        expect(error.requestId).toBe("req-123");
    });

    it("does not carry request headers", () => {
        const error = normalizeError(axiosError(401, errorBody429()));
        expect(JSON.stringify(error)).not.toContain("secret");
        expect(Object.keys(error)).not.toContain("config");
    });
});

function errorBody429() {
    return {error: {code: "RATE_LIMITED", message: "slow down"}};
}

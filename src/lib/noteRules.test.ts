import {ApiError} from "@/api/errors";
import {buildNoteBody, isNoteFieldError, isNoteTooLong, noteLength} from "./noteRules";

describe("noteRules", () => {
    it("trims before counting", () => {
        expect(noteLength("  abc  ")).toBe(3);
    });

    it("allows 200 and rejects 201", () => {
        expect(isNoteTooLong("a".repeat(200))).toBe(false);
        expect(isNoteTooLong("a".repeat(201))).toBe(true);
    });

    it("counts an emoji as one character", () => {
        expect(noteLength("😀".repeat(100))).toBe(100);
        expect(isNoteTooLong("😀".repeat(200))).toBe(false);
    });

    it("builds an empty body for a blank note and a trimmed body otherwise", () => {
        expect(buildNoteBody("   ")).toEqual({});
        expect(buildNoteBody(" hi ")).toEqual({note: "hi"});
    });
});

function apiError(status: number | null, details: {field?: string} | null): ApiError {
    return new ApiError({message: "x", status, code: null, details, requestId: null, retryAfter: null});
}

describe("isNoteFieldError", () => {
    it("is true only for a 400 on the note field", () => {
        expect(isNoteFieldError(apiError(400, {field: "note"}))).toBe(true);
        expect(isNoteFieldError(apiError(400, {field: "other"}))).toBe(false);
        expect(isNoteFieldError(apiError(400, null))).toBe(false);
        expect(isNoteFieldError(apiError(500, {field: "note"}))).toBe(false);
    });
});

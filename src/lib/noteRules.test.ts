import {buildNoteBody, isNoteTooLong, noteLength} from "./noteRules";

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

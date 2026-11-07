export const NOTE_MAX_LENGTH = 200;

// Backend trims, then counts characters: do the same, by code point, so an emoji never counts double.
export function noteLength(note: string): number {
    return Array.from(note.trim()).length;
}

export function isNoteTooLong(note: string): boolean {
    return noteLength(note) > NOTE_MAX_LENGTH;
}

// The backend denies unknown fields: send `note` only, and only when there is one.
export function buildNoteBody(note: string): {note?: string} {
    const trimmed = note.trim();
    return trimmed === "" ? {} : {note: trimmed};
}

import React from "react";
import {t} from "@/i18n";
import {isNoteTooLong, noteLength} from "@/lib/noteRules";

interface NoteFieldProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    serverError: string | null; // message of a backend 400 field=note; the caller clears it on edit
}

export const NoteField = ({id, value, onChange, disabled, serverError}: NoteFieldProps) => {
    const tooLong = isNoteTooLong(value);
    const invalid = tooLong || serverError !== null;

    return (
        <div className="space-y-1">
            <label htmlFor={id} className="text-sm text-black/60">
                {t("noteField.label")}
            </label>
            <textarea
                id={id}
                rows={2}
                value={value}
                disabled={disabled}
                aria-invalid={invalid}
                className={`w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${invalid ? "border-red-300" : "border-black/15 focus:border-black/40"}`}
                onChange={event => onChange(event.target.value)}
            />
            <div className="flex items-start justify-between gap-2 text-xs">
                <span role={invalid ? "alert" : undefined} className="text-red-700">
                    {tooLong ? t("noteField.tooLong") : serverError}
                </span>
                <span className={tooLong ? "font-bold text-red-700" : "text-black/60"}>{t("noteField.count", {n: noteLength(value)})}</span>
            </div>
        </div>
    );
};

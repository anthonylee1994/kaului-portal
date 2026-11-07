import React from "react";
import {useNavigate} from "react-router";
import {t} from "@/i18n";

const TONES = {
    dark: {
        input: "border-[#cfc4c5]/30 bg-[#1b1b1b] text-white placeholder:text-[#cfc4c5] focus:border-[#7e7576]",
        button: "bg-white text-black hover:bg-[#e2e2e2]",
    },
    light: {
        input: "border-black/15 bg-white text-black placeholder:text-black/40 focus:border-black/40",
        button: "bg-black text-white hover:bg-black/80",
    },
};

export const UserLookupForm = ({tone, className = ""}: {tone: "dark" | "light"; className?: string}) => {
    const navigate = useNavigate();
    const [value, setValue] = React.useState("");
    const [empty, setEmpty] = React.useState(false);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        const id = value.trim();
        setEmpty(id === "");
        if (id === "") return;
        // The input is a path segment, never a path: encode so `../reports/x` cannot leave /users/.
        navigate(`/users/${encodeURIComponent(id)}`);
    };

    return (
        <form role="search" className={`items-center gap-1.5 ${className}`} onSubmit={handleSubmit}>
            <input
                value={value}
                aria-label={t("shell.userLookupLabel")}
                aria-invalid={empty}
                placeholder={t("shell.userLookupPlaceholder")}
                autoComplete="off"
                spellCheck={false}
                className={`h-7.5 w-full min-w-0 rounded-lg border px-2.5 font-mono text-xs focus:outline-none md:w-64 ${TONES[tone].input}`}
                onChange={event => {
                    setValue(event.target.value);
                    setEmpty(false);
                }}
            />
            <button type="submit" className={`h-7.5 cursor-pointer rounded-lg px-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${TONES[tone].button}`}>
                {t("shell.userLookupSubmit")}
            </button>
        </form>
    );
};

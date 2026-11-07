import React from "react";

// Remaining seconds; 0 when finished or when `seconds` is null. Restarts whenever `seconds` changes.
export function useCountdown(seconds: number | null): number {
    const [remaining, setRemaining] = React.useState(seconds ?? 0);

    React.useEffect(() => {
        setRemaining(seconds ?? 0);
        if (!seconds) return;
        const timer = setInterval(() => {
            setRemaining(current => Math.max(0, current - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [seconds]);

    return remaining;
}

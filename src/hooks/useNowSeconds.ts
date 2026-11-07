import React from "react";

// Current time, re-read every second. Not paused while the tab is hidden: the cost is negligible and the number never jumps on return.
export function useNowSeconds(): number {
    const [now, setNow] = React.useState(() => Date.now());

    React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    return now;
}

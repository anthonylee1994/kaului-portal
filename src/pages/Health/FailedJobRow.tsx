import React from "react";
import type {FailedJobItem} from "@/api/types";
import {TimeText} from "@/components/TimeText";
import {t} from "@/i18n";
import {formatCount} from "@/lib/formatCount";

const CELL = "px-4 py-3 align-top";

// Expanded state lives here, and the parent keys rows by job id, so a polling refresh never collapses an open row.
export const FailedJobRow = ({item}: {item: FailedJobItem}) => {
    const errorId = React.useId();
    const errorRef = React.useRef<HTMLParagraphElement>(null);
    const [expanded, setExpanded] = React.useState(false);
    const [overflowing, setOverflowing] = React.useState(false);

    // Only a clamped message that really overflows gets a toggle. Not re-measured while expanded (it would read as not overflowing).
    React.useLayoutEffect(() => {
        const element = errorRef.current;
        if (element && !expanded) setOverflowing(element.scrollHeight > element.clientHeight);
    }, [item.last_error, expanded]);

    return (
        <tr className="border-b border-black/10 last:border-b-0">
            <td className={`${CELL} font-mono whitespace-nowrap`}>{item.kind}</td>
            <td className={`${CELL} text-right font-mono tabular-nums`}>{formatCount(item.attempts)}</td>
            <td className={`${CELL} min-w-64`}>
                {item.last_error === null ? (
                    t("health.unavailable")
                ) : (
                    <React.Fragment>
                        <p ref={errorRef} id={errorId} className={expanded ? "font-mono text-xs break-words whitespace-pre-wrap" : "line-clamp-2 break-words"}>
                            {item.last_error}
                        </p>
                        {(overflowing || expanded) && (
                            <button
                                type="button"
                                aria-expanded={expanded}
                                aria-controls={errorId}
                                className="mt-1 cursor-pointer text-xs font-medium underline"
                                onClick={() => setExpanded(current => !current)}
                            >
                                {expanded ? t("health.collapse") : t("health.expand")}
                            </button>
                        )}
                    </React.Fragment>
                )}
            </td>
            <td className={`${CELL} whitespace-nowrap`}>
                <TimeText value={item.failed_at} mode="both" />
            </td>
        </tr>
    );
};

import React from "react";

export const MetricCard = ({title, children}: {title: string; children: React.ReactNode}) => {
    const titleId = React.useId();
    return (
        <section aria-labelledby={titleId} className="space-y-3 rounded-2xl border border-black/15 bg-white p-4">
            <h2 id={titleId} className="text-sm font-semibold">
                {title}
            </h2>
            {children}
        </section>
    );
};

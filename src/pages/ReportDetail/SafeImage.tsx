import React from "react";

function isSafeSrc(src: string | null): src is string {
    if (src === null) return false;
    try {
        const {protocol} = new URL(src);
        return protocol === "https:" || protocol === "http:";
    } catch {
        return false;
    }
}

// User-supplied image URLs only ever go into <img src>, behind a scheme allowlist; never into an href.
// `render` wraps the <img> only when it is shown (e.g. in a button), so a failed image leaves no empty control behind.
export const SafeImage = ({
    src,
    alt,
    className,
    fallback,
    render,
}: {
    src: string | null;
    alt: string;
    className?: string;
    fallback: React.ReactNode;
    render?: (image: React.ReactNode) => React.ReactNode;
}) => {
    const [failedSrc, setFailedSrc] = React.useState<string | null>(null);

    // The error is remembered per src, so a new src starts clean.
    if (!isSafeSrc(src) || failedSrc === src) return <React.Fragment>{fallback}</React.Fragment>;
    const image = <img src={src} alt={alt} className={className} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailedSrc(src)} />;
    return <React.Fragment>{render ? render(image) : image}</React.Fragment>;
};

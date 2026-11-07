import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; HeroUI components construct one.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

// jsdom has no Element.getAnimations; the HeroUI Tabs indicator calls it on selection change.
if (typeof Element.prototype.getAnimations !== "function") {
    Element.prototype.getAnimations = () => [];
}

afterEach(() => {
    sessionStorage.clear();
});

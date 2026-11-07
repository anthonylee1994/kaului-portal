import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; HeroUI components construct one.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

afterEach(() => {
    sessionStorage.clear();
});

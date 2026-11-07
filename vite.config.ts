import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {defineConfig} from "vitest/config";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {"@": path.resolve(import.meta.dirname, "src")},
    },
    server: {port: 5174, strictPort: true},
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["src/test/setup.ts"],
        css: false,
        env: {VITE_API_BASE: "http://localhost:8080"},
    },
});

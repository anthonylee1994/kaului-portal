import {defineConfig} from "@playwright/test";

export default defineConfig({
    testDir: "e2e",
    testMatch: "**/*.e2e.ts",
    globalSetup: "./e2e/globalSetup.ts",
    workers: 1,
    fullyParallel: false,
    reporter: "list",
    use: {baseURL: "http://localhost:5174", trace: "retain-on-failure"},
    webServer: {command: "pnpm dev", url: "http://localhost:5174", reuseExistingServer: true},
});

export default function globalSetup() {
    const base = process.env.E2E_API_BASE ?? "http://localhost:8080";
    if (!process.env.E2E_ADMIN_TOKEN) {
        throw new Error("E2E_ADMIN_TOKEN is required (the backend's ADMIN_TOKEN). See e2e/README.md.");
    }
    // The suite writes test accounts and reports and locks the caller's IP out for about a minute.
    if (base.includes("api.kaului.com")) {
        throw new Error("Refusing to run E2E against production. Use a local or staging backend.");
    }
}

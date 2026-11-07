# E2E (Playwright)

Runs against a **real backend**. Local or staging only.

```bash
# backend: ADMIN_TOKEN set, ALLOWED_ORIGINS includes http://localhost:5174
E2E_ADMIN_TOKEN=<backend ADMIN_TOKEN> pnpm e2e
```

| Variable          | Default                 | Meaning                                                 |
| ----------------- | ----------------------- | ------------------------------------------------------- |
| `E2E_ADMIN_TOKEN` | (required)              | Same value as the backend's `ADMIN_TOKEN`               |
| `E2E_API_BASE`    | `http://localhost:8080` | Backend origin; must match the portal's `VITE_API_BASE` |

The dev server (`pnpm dev`, port 5174) is started automatically.

## Know before you run

- **Never run against production.** `globalSetup` refuses `api.kaului.com`. The backend has no delete API, so every run leaves test accounts and reports in the DB.
- Registers 3 device accounts per run; keep the backend's `REGISTER_PER_HOUR` at 4 or more.
- The last scenario deliberately trips the per-IP failed-login limit. **For about 1 minute afterwards, logging in by hand from this machine returns 429.**
- Scenarios run serially in one worker and depend on each other's order.
- The token only comes from the environment and is typed into the login form. A Playwright trace of the login page can contain it, so do not upload traces from a real token.

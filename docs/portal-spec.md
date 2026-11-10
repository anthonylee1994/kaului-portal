# Kaului Portal Spec

The admin console (web) for Kaului. It talks to `/v1/admin/*` in the `backend` repo and lets operators handle reports, ban users, and check system health.

- Contract source (authoritative): `backend/specs/phase-5-spec.md` §7 (report / ban / admin) and §10 (metrics); the implementation lives in `backend/src/admin/`
- **The admin API is deliberately excluded from `openapi.json`** (`backend/specs/phase-6-spec.md` §1, §12 item 8), so the portal has **no** `gen:api` and types must be written by hand (§5)
- Status: Draft v0.1
- Note on UI copy: user-facing strings quoted in this document are English glosses. The shipped copy is `zh-Hant` and lives in `src/i18n/`.

---

## 1. Goals and Non-goals

**Goals**

1. Report queue: list open reports, view the evidence snapshot, dismiss or ban in one click.
2. User lookup: enter a user id, view status and report stats, and ban / unban.
3. System health: view metrics and dead-letter jobs.
4. Manageable by a single operator: fewest possible steps, and hard to ban the wrong person by mistake.

**Non-goals (MVP)**

- Multiple admins / role-based permissions (the backend only has a single `ADMIN_TOKEN`; settled in Phase 5 §2).
- User list / search, full chat browsing, browsing the `admin_actions` audit log (the backend has no matching endpoints; see §10).
- Appeal flow for banned users.
- Mobile optimization (desktop browsers first, but the layout must not break).

---

## 2. Backend Facts (the portal must comply)

### 2.1 Authentication

| Item                  | Behavior                                                                                                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header                | `Authorization: Bearer <ADMIN_TOKEN>` (≥ 32 chars; ordinary user tokens are invalid)                                                                                                                                        |
| `ADMIN_TOKEN` not set | **Every** `/v1/admin/*` returns `404 NOT_FOUND` (pretends admin does not exist)                                                                                                                                             |
| Wrong token           | `401 UNAUTHENTICATED`, and counts toward the per-IP failure rate limit                                                                                                                                                      |
| Failure rate limit    | From the **11th failure within 1 minute** from the same IP, all subsequent requests (**including those with a correct token**) return `429` with `Retry-After` until the window passes. Successful requests are not counted |
| Relation to user API  | Separate extractor; not affected by `api_limiter`, and never returns `403 ACCOUNT_BANNED`                                                                                                                                   |

The portal's login screen must therefore distinguish: `404` = "admin console not enabled", `401` = "incorrect token", `429` = "too many attempts, try again in N seconds". They **must not** be collapsed into one generic "login failed" message.

### 2.2 Common Format

- Base: `{VITE_API_BASE}/v1` (local `http://localhost:8080/v1`, production `https://api.kaului.com/v1`).
- Time: epoch **milliseconds** (`created_at`, `resolved_at`, `failed_at`, `last_active_at`, `server_now`).
- IDs: UUIDv7 strings; lists use keyset pagination (`id DESC`).
- Error body: `{ "error": { "code", "message", "details" } }`; field validation errors = `400 VALIDATION_FAILED` with `details.field` naming the field (admin can hit `note` / `limit` / `status` / `before`).
- Request bodies always enable `deny_unknown_fields`: **do not** send extra fields.
- Responses carry `X-Request-Id` (exposed via CORS). Error screens must show it so it can be matched against server logs.

### 2.3 CORS (must be handled first)

Phase 5 assumed admin would only be used via curl, so CORS was not designed for admin. But the CORS layer is global (`ALLOWED_ORIGINS`) and already allows the `Authorization` / `Content-Type` headers and `GET/POST`, so:

- **Approach**: add the portal origin to the backend's `ALLOWED_ORIGINS` (comma-separated, e.g. `http://localhost:5173,http://localhost:5174,https://portal.kaului.com`). **No backend code change is needed.**
- The portal's dev port **must not collide with the PWA** (the PWA uses 5173). The portal uses `5174` with `--strictPort`.
- Cost: the PWA and the portal share one allow-list. This is acceptable, because the real protection is `ADMIN_TOKEN`, not CORS.
- Production: the portal is deployed on Vercel with origin `https://portal.kaului.com` (§8.1). **The `*.vercel.app` origins of Vercel preview deployments are not in the allow-list**, so previews cannot reach the backend (blocked by CORS). To verify against a real backend, always use local dev or production. Loosening the allow-list for previews is not recommended (`ALLOWED_ORIGINS` does not support wildcards).
- Alternative (not recommended): use Vercel `rewrites` to reverse-proxy `/v1/admin/*` to `https://api.kaului.com`, making it same-origin and avoiding CORS. But admin traffic would take an extra hop, and through the Vercel proxy the client IP the backend sees becomes a Vercel egress IP, so the **per-IP failure rate limit (§2.1) becomes inaccurate**. Not adopted.

---

## 3. Endpoints

All require `AdminAuth` (§2.1).

| Method | Path                                                       | Purpose                                        | Success response                        |
| ------ | ---------------------------------------------------------- | ---------------------------------------------- | --------------------------------------- |
| GET    | `/admin/reports?status=open\|all&before=<id>&limit=1..100` | Report list (default `open`, `limit` 50)       | `200 { items: ReportItem[], has_more }` |
| GET    | `/admin/reports/{id}`                                      | Single report, **including `evidence`**        | `200 ReportItem`                        |
| POST   | `/admin/reports/{id}/dismiss`                              | Close without penalty, body `{ note? }`        | `200 ReportItem` (latest state)         |
| POST   | `/admin/reports/{id}/ban`                                  | Ban the target from a report, body `{ note? }` | `200 { status: "banned" }`              |
| GET    | `/admin/users/{id}`                                        | User summary                                   | `200 AdminUser`; `404` if not found     |
| POST   | `/admin/users/{id}/ban`                                    | Ban, body `{ note? }`                          | `200 { status: "banned" }`              |
| POST   | `/admin/users/{id}/unban`                                  | Unban, body `{ note? }`                        | `200 { status: "active" }`              |
| GET    | `/admin/jobs/failed?limit=1..100`                          | Dead-letter jobs (default 50)                  | `200 { items: FailedJobItem[] }`        |
| GET    | `/admin/metrics`                                           | System snapshot                                | `200` JSON (§3.2)                       |

### 3.1 Key Semantics

- **The list does not include `evidence`** (`null` / absent); it is only available on the detail endpoint. The portal must not expect evidence in the list.
- **`note`**: optional, trimmed, ≤ 200 chars; longer returns `400` (`details.field = "note"`). The UI must show a character counter and block before submitting.
- **Idempotent**:
    - Dismissing a report that is no longer open → `200` with the current state, no error.
    - Banning an already-banned user → `200`, no audit entry written. Unbanning a non-banned user → `200`, no-op.
    - Banning a `deleted` or non-existent user → `404`.
- **Ban side effects** (the confirm dialog must state them clearly): all of the target's open matches are closed (the other side only sees the match disappear), pending hellos expire silently, push subscriptions are deleted, **all** open reports against that user are auto-closed (`actioned`), and their in-flight SSE connections are dropped immediately. The reporter is **not** notified.
- **Unban does not restore anything**: matches / hellos / push subscriptions are not brought back; the Title / profile recover naturally. The UI must say so explicitly.
- **Ban limitation**: accounts are device-based, so a banned user can create a new account. The UI must not imply that "banning solves it".
- **`report/{id}/ban` vs `users/{id}/ban`**: the former is audited as `report.ban` (with the report id), the latter as `ban`. When acting from a report page, always use the former.

### 3.2 Data Shapes (hand-written types in `src/api/types.ts`)

```ts
type ReportReason = "spam" | "harassment" | "inappropriate" | "underage" | "other";
type ReportStatus = "open" | "dismissed" | "actioned";
type UserStatus = "active" | "banned" | "deleted";

interface ReportItem {
    id: string;
    reporter_id: string;
    target: {id: string; status: UserStatus; open_reports: number};
    reason: ReportReason;
    detail: string | null; // ≤ 500 chars
    status: ReportStatus;
    created_at: number;
    resolved_at: number | null;
    evidence?: Evidence | null; // only provided by GET /reports/{id}; cleared to null after 90 days
}

interface Evidence {
    title: string | null; // the target's active Title at the time of the report
    avatar_url: string | null;
    messages: EvidenceMessage[]; // latest 20 between reporter ↔ target, newest → oldest; no interaction = []
}

interface EvidenceMessage {
    id: string;
    sender_id: string;
    kind: "text" | "image";
    body: string | null;
    image_url: string | null;
    created_at: number;
}

interface AdminUser {
    id: string;
    status: UserStatus;
    created_at: number;
    last_active_at: number;
    inbox_count: number;
    open_reports: number;
    total_reports: number;
    has_active_title: boolean;
}

interface FailedJobItem {
    id: string;
    kind: string;
    attempts: number;
    last_error: string | null;
    failed_at: number;
}
```

`/admin/metrics` response (`backend/src/metrics.rs::snapshot`):

```jsonc
{
  "server_now": 0,
  "uptime_secs": 0,
  "db":   { "write_wait_ms": Hist, "sqlite_busy_total": 0 },
  "jobs": { "ready": 0, "locked": 0, "failed_total": 0,
            "oldest_ready_age_ms": null /* or number */, "latency_ms": Hist },
  "sse":  { "connections": 0, "evictions_total": 0 },
  "http": { "responses_5xx_total": 0,
            "rate_limited_total": { "api": 0, "admin_fail": 0 /* …other limiter names */ } },
  "events": { "max_id": 0 }
}
// Hist = { count, p50, p95, p99, max } (milliseconds; percentiles are bucket upper bounds)
```

The key set of `rate_limited_total` is determined by the backend's `Limiter::ALL`. The portal **must render it dynamically by key** and must not hard-code it.

---

## 4. Screens

### 4.1 Routes

| Path           | Screen                             |
| -------------- | ---------------------------------- |
| `/login`       | Enter the admin token              |
| `/`            | Redirects to `/reports`            |
| `/reports`     | Report queue (tabs: Open / All)    |
| `/reports/:id` | Report detail + evidence + actions |
| `/users/:id`   | User summary + ban / unban         |
| `/health`      | Metrics + failed jobs              |

When not logged in, visiting any route other than `/login` redirects to `/login` (preserving `redirect`).

### 4.2 `/login`

- A password field (`type="password"`) and a "Log in" button.
- Login = call `GET /admin/metrics` with the entered token (lightest payload, and the only GET without a path parameter). Only a `200` response counts as success and stores the token.
- Error routing: `404` → "Admin console not enabled"; `401` → "Incorrect token"; `429` → "Too many attempts, try again in N seconds" (read `Retry-After`, disable the button during the countdown); network error → "Cannot connect to server".
- **Repeated-failure hint**: counted client-side; from the 5th failure on, show "10 failures per minute from the same IP will be locked out".

### 4.3 `/reports`

- Tabs: **Open** (default, `status=open`) / **All**.
- Table columns: time, Reason (chip), Target (shortened id + status chip), **Target open count** (`target.open_reports`, red when ≥ 3 as a repeat-offender indicator), Reporter (shortened id), Status.
- Ordering: the backend is fixed newest → oldest; the portal does not re-sort.
- Pagination: "Load more", using the last item's `id` as `before`, hidden when `has_more=false`. **Page numbers must not be used** (keyset has no total).
- Clicking a row → `/reports/:id`. A "Refresh" button at the top right; no auto-polling in the MVP.
- Empty state: when the Open tab is empty show "No pending reports" (no emoji, per the design).
- Within the Open tab, reports closed by other actions no longer appear; refetch when returning to the list after handling a report on the detail page.

### 4.4 `/reports/:id`

Top to bottom:

1. **Header**: Reason chip, Status chip, created time, (when closed) resolved time.
2. **Detail**: the `detail` written by the reporter (when null show "(No description)"). **Render as plain text; `dangerouslySetInnerHTML` is forbidden** (user content).
3. **Target card**: id, status chip, `open_reports`; link to `/users/:id`.
4. **Evidence**:
    - Title, avatar (`avatar_url`; the `<img>` must have `referrerPolicy="no-referrer"` and `loading="lazy"`, and show a placeholder on load failure).
    - Messages in a chat style, **displayed oldest → newest** (the backend is newest → oldest, so the frontend must reverse); split into two sides, "reporter / reported", by `sender_id`; `kind=image` shows a thumbnail that enlarges on click.
    - `evidence == null` → "Evidence exceeded the retention period (90 days) and was purged"; empty `messages` → "No chat history between the two parties".
    - Notice bar: "Evidence is a snapshot taken at report time and is not updated".
5. **Action bar** (only shown when `status=open`; otherwise show the read-only outcome):
    - Note input (optional, ≤ 200).
    - **Dismiss** (secondary button), **Ban target** (danger button).
    - Ban requires a second-step confirmation modal listing the side effects from §3.1; if `target.status` is already `banned`, the Ban button is disabled with the hint "User is already banned".
6. On success: show a toast and return to `/reports` (or stay on the page and refetch to show the new state, depending on design).
7. If Dismiss returns `200` but `status` is not `dismissed` (e.g. already closed by another action): show the latest state faithfully and toast "This report has already been handled"; it must not be treated as a successful dismiss.

### 4.5 `/users/:id`

- Show all `AdminUser` fields; `last_active_at` and `created_at` show absolute + relative time.
- Status chip: `active` green, `banned` red, `deleted` gray.
- Actions: `active` → "Ban"; `banned` → "Unban"; `deleted` → no action (the backend would return 404). Also has a note field and a confirm modal.
- `404` → "User does not exist or was deleted" (the backend does not distinguish the two).
- A "Look up by user id" input at the top of the page (the portal's global header also has one), since there is no user list.
- Link: "Reports against this user" **cannot be implemented for now** (the backend has no by-target query); see §10.

### 4.6 `/health`

- **Metrics cards** (auto-refresh every 15 seconds, paused while the page is hidden; plus a manual refresh button):
    - Overview: uptime (human-readable), SSE connections, `responses_5xx_total`.
    - DB: p50/p95/p99/max of `write_wait_ms`, `sqlite_busy_total` (red when > 0).
    - Jobs: ready / locked / `failed_total` (red when > 0), `oldest_ready_age_ms` (show "—" when null), `latency_ms`.
    - Rate limited: list `rate_limited_total` by key; `api > 0` is yellow (Phase 6 requires investigating whether the PWA is polling), `admin_fail > 0` is yellow (someone is trying to guess the token).
- **Failed jobs table**: `kind`, `attempts`, `last_error` (truncated + expandable), `failed_at`. `limit=50`. The backend provides no payload and has no retry endpoint, so it is **strictly read-only**.
- Note that `/admin/metrics` itself does not count toward `admin_fail` (successful requests are not counted).

---

## 5. Frontend Stack and Structure

Reuse the `frontend` tech stack to lower maintenance cost, but the **portal is a separate repo / project** (`portal/`) and does not share a build with the PWA.

| Area                            | Choice                                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build                           | Vite + React + TypeScript (`App.tsx` renamed to `app.tsx`, `export const App`)                                                                                                            |
| UI                              | HeroUI (`@heroui/react`) + Tailwind CSS; custom styles use Less (`.less` imports last)                                                                                                    |
| Router                          | `react-router`                                                                                                                                                                            |
| HTTP                            | A single `axios` instance + interceptors (same style as frontend's `api/client.ts`)                                                                                                       |
| State                           | `zustand`: only holds the session (token) and a little UI state; **no global cache for server data**, each page fetches its own (the portal's data volume is small and must be real-time) |
| Types                           | Hand-written `src/api/types.ts` (§3.2); admin is not in openapi, so there is no code generation                                                                                           |
| Language                        | UI copy uses `zh-Hant` (formal written Chinese), centralized in `i18n/`, same as frontend                                                                                                 |
| No PWA / SSE / push / IndexedDB | Not needed by the portal                                                                                                                                                                  |

Coding standards follow `~/.claude/CLAUDE.md` (`React.xxx()` without destructuring, `React.Fragment`, `export const Component`, hooks use `export function useXxx`, no `useCallback` around arrow functions inside components, prefer `ReactUtil.memo` for memo, one component per file).

```
portal/
├─ portal-spec.md
├─ .env.example               # VITE_API_BASE=http://localhost:8080
└─ src/
   ├─ main.tsx
   ├─ app.tsx
   ├─ router.tsx              # includes RequireAuth
   ├─ api/
   │  ├─ types.ts             # §3.2
   │  ├─ client.ts            # axios instance; Bearer, error normalization, X-Request-Id
   │  ├─ errors.ts            # ApiError(status, code, details, requestId, retryAfter)
   │  └─ endpoints/           # reports.ts, users.ts, jobs.ts, metrics.ts
   ├─ session/
   │  └─ sessionStore.ts      # token, login(), logout()
   ├─ pages/
   │  ├─ Login/index.tsx
   │  ├─ Reports/index.tsx            # list
   │  ├─ ReportDetail/index.tsx
   │  │   ├─ Evidence.tsx
   │  │   └─ ActionBar.tsx
   │  ├─ User/index.tsx
   │  └─ Health/index.tsx
   ├─ components/             # AdminShell, StatusChip, ReasonChip, ConfirmModal, IdTag, TimeText
   ├─ i18n/
   └─ styles/
```

### 5.1 API Client Rules

- `baseURL = VITE_API_BASE + '/v1'`; a missing `VITE_API_BASE` → throw at startup (same as frontend).
- Request interceptor: add `Authorization: Bearer <token>`.
- Response interceptor: normalize into `ApiError`, preserving `status`, `error.code`, `error.details.field`, `X-Request-Id`, `Retry-After`.
- **`401` / `404` (after login)**:
    - While logged in, any admin call returning `401` → clear the token and redirect to `/login` (the token has been rotated).
    - While logged in, a `404` depends on the path: a `404` on `/users/{id}` or `/reports/{id}` means "resource does not exist"; only a `404` from the login probe (`/admin/metrics`) means "admin console not enabled".
- `429`: show the toast "Too many requests, try again in N seconds" and **do not auto-retry**.
- All mutation buttons must be disabled while submitting, to prevent double clicks.
- No retry and no optimistic updates (operator actions must reflect the server response).

### 5.2 Token Handling (important)

`ADMIN_TOKEN` is a single master credential; if it leaks, it is equivalent to full control.

- **Store only in `sessionStorage`** (invalidated when the tab closes) or purely in memory; **`localStorage` / IndexedDB / cookies / URLs are strictly forbidden**. For the MVP, pick either pure memory or `sessionStorage`; the default is `sessionStorage` so a refresh keeps the login.
- The input field has `autocomplete="off"`; never `console.log` the token; error reporting must not attach headers.
- Provide a "Log out" function (clears the store and `sessionStorage`).
- Auto-logout after 30 minutes idle (optional for the MVP).
- The portal is deployed on Vercel (automatic HTTPS); response headers are set in `vercel.json` (§8.1): CSP (`default-src 'self'`; `img-src` allows the image host `https://img.eservice-hk.net` and the evidence image host; `connect-src` allows `https://api.kaului.com`), `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex, nofollow`.
- Because of the IP failure rate limit, the portal must not retry in the background with a stale token (it would burn the failure quota).

---

## 6. Error Handling Matrix

| Case                                            | Location      | UI behavior                                                    |
| ----------------------------------------------- | ------------- | -------------------------------------------------------------- |
| `404` @ login probe                             | `/login`      | "Admin console not enabled"                                    |
| `401` @ login                                   | `/login`      | "Incorrect token"                                              |
| `401` @ logged in                               | Anywhere      | Clear session → `/login`, toast "Login expired"                |
| `429`                                           | Anywhere      | Show a `Retry-After` countdown; login disables button          |
| `400 VALIDATION_FAILED`, `details.field = note` | ActionBar     | Note field turns red + message                                 |
| `404` @ `/reports/{id}`                         | Detail        | "Report does not exist" + back to list                         |
| `404` @ `/users/{id}`                           | User          | "User does not exist or was deleted"                           |
| `404` @ ban / unban                             | User / Report | "User was deleted or does not exist; cannot act", then refetch |
| `5xx` / network error                           | Anywhere      | Error card + "Retry" + show `X-Request-Id`                     |

---

## 7. Safety and Misoperation Protection

- Ban always requires a second-step confirmation (modal) listing the side effects; unban also requires confirmation.
- The confirm modal must show the full target id, to avoid banning the wrong person.
- Destructive buttons must be visually distinct from ordinary buttons (danger color) and must not be placed right next to Dismiss.
- All user-provided content (`detail`, Title, message `body`) is always rendered as plain text; `image_url` / `avatar_url` are only used for `<img src>` and must not be used as a link `href` that opens a new page (to avoid `javascript:` and referrer leakage).
- Every state-changing action is written by the backend to `admin_actions` and logged (`target: "admin"`); the portal does not need to record audits itself.

---

## 8. Environment and Scripts

| Variable        | Description                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE` | API origin, **without `/v1`**. `.env.development` → `http://localhost:8080`; production → `https://api.kaului.com` (Vercel environment variable, see §8.1) |

| Command       | Description                     |
| ------------- | ------------------------------- |
| `pnpm dev`    | `vite --port 5174 --strictPort` |
| `pnpm build`  | Production build                |
| `pnpm test`   | Vitest                          |
| `pnpm format` | Prettier                        |

Local integration with the backend:

```bash
# backend/.env
ADMIN_TOKEN=$(openssl rand -hex 32)          # ≥ 32 chars
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

### 8.1 Deployment (Vercel + `https://portal.kaului.com`)

A pure static SPA deployed on Vercel; the production URL is `https://portal.kaului.com`.

| Item              | Setting                                                                                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework preset  | Vite; Build `pnpm build`; Output `dist`                                                                                                                                                                                                   |
| Production branch | `main` (deploys on push)                                                                                                                                                                                                                  |
| Domain            | Add `portal.kaului.com` in the Vercel project; add DNS `CNAME portal → cname.vercel-dns.com` (or the value Vercel indicates); the certificate is issued automatically by Vercel                                                           |
| Environment vars  | `VITE_API_BASE=https://api.kaului.com` (Production). Vite **inlines it at build time**, so a change requires a redeploy. `ADMIN_TOKEN` must **never** go into Vercel env (the portal is pure frontend; operators type the token at login) |
| Backend           | Add `https://portal.kaului.com` to `ALLOWED_ORIGINS` (§2.3); takes effect after restarting the backend                                                                                                                                    |
| Preview           | `*.vercel.app` is not in the allow-list and cannot reach the backend (expected; see §2.3); previews are only for viewing static screens                                                                                                   |

`vercel.json` (placed at the repo root):

```json
{
    "rewrites": [{"source": "/(.*)", "destination": "/index.html"}],
    "headers": [
        {
            "source": "/(.*)",
            "headers": [
                {
                    "key": "Content-Security-Policy",
                    "value": "default-src 'self'; img-src 'self' data: https://img.eservice-hk.net; connect-src 'self' https://api.kaului.com; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
                },
                {"key": "Referrer-Policy", "value": "no-referrer"},
                {"key": "X-Frame-Options", "value": "DENY"},
                {"key": "X-Content-Type-Options", "value": "nosniff"},
                {"key": "X-Robots-Tag", "value": "noindex, nofollow"}
            ]
        }
    ]
}
```

- `rewrites` keep deep links such as `/reports/:id` from returning 404 on refresh. Vercel serves files that actually exist in `dist` first (`/assets/*`) and only falls back for the rest.
- `style-src 'unsafe-inline'` is a common requirement for HeroUI / Tailwind runtime styles; if testing shows it is not needed, remove it.
- The evidence image host is whatever the backend's actual `IMG_URL_PREFIX` is (`https://img.eservice-hk.net/upload/`); if there are other hosts, add them to `img-src`.
- Add `robots.txt` (`Disallow: /`) as a belt-and-braces measure.

**Outer protection**: a Vercel static site has no basic auth. The real protection is `ADMIN_TOKEN` plus the backend's per-IP failure rate limit (§2.1). Optional hardening: Vercel Deployment Protection / custom Firewall rules (availability depends on the plan; confirm in the dashboard before going live). Because the portal is at a public URL, **the login page's error messages must not leak extra information** (the 404/401/429 split in §4.2 is acceptable).

---

## 9. Testing

- **Unit (Vitest + RTL)**:
    - `ApiError` normalization (including `Retry-After`, `details.field`).
    - `sessionStore`: login success / each error branch, logout clears `sessionStorage`.
    - Evidence rendering: reverse order, `null` evidence, empty messages, image kind.
    - ActionBar: no actions when not open, Ban disabled for a banned target, `note` > 200 chars blocked.
    - When Dismiss returns a non-`dismissed` status, show "already handled".
- **Mock**: use MSW or an axios adapter to mock `/v1/admin/*`; response shapes can follow the fixtures in `backend/tests/admin.rs`.
- **E2E (Playwright, against a real backend)**:
    1. Start the backend (with `ADMIN_TOKEN` set), create two accounts via `POST /auth/device`, and create a report via `POST /v1/reports`.
    2. Log in to the portal → see the queue → open the detail and see the evidence → dismiss → the item disappears from the queue.
    3. Create another report → ban → confirm the target `status=banned`, all its open reports are closed, and calling `/v1/me` with the target's token returns `403 ACCOUNT_BANNED`.
    4. Unban → `status=active`.
    5. Try a wrong token 11 times in a row → `429` from the 11th on, and afterwards even the correct token returns `429` (verifies §2.1).
- **Manual**: with `ADMIN_TOKEN` unset → login shows "Admin console not enabled".

---

## 10. Backend Gaps and Recommendations (what the portal cannot do)

The following require new backend endpoints before they can be implemented; the **MVP is not blocked**, but they will become pain points after running for a while:

| #   | Gap                                  | Impact                                                                                                        | Recommendation                                                                                   |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | No `GET /admin/users` list / search  | Users can only be looked up by id; must rely on navigation from report pages                                  | Add a keyset list, sortable by `status`, `open_reports`                                          |
| 2   | No "all reports for a target" query  | The user page cannot show report history; repeat-offender judgment relies on the `total_reports` number alone | `GET /admin/reports?target=<id>`                                                                 |
| 3   | `admin_actions` cannot be read       | Cannot see who banned / unbanned when, or the note contents                                                   | `GET /admin/actions?user_id=`                                                                    |
| 4   | `ReportItem` has no reporter summary | Cannot tell whether a reporter is abusing reports                                                             | Add `reporter.status` / the reporter's report count                                              |
| 5   | Failed jobs have no retry / purge    | Failures are visible, but must be handled by logging into the server                                          | Add `POST /admin/jobs/{id}/retry` if needed                                                      |
| 6   | Admin is not in OpenAPI              | Portal types must be maintained by hand and easily drift from the backend                                     | Per Phase 6 §12 item 8: generate a separate `openapi-admin.json`, then the portal runs `gen:api` |
| 7   | A single shared `ADMIN_TOKEN`        | No per-person audit (`admin_actions` does not record the operator)                                            | Multi-admin is beyond Phase 5; leave for later                                                   |

---

## 11. Implementation Phases

Each phase is a slice that can be merged and accepted independently. The order has dependencies and must not be skipped. After each code change, run only Prettier (`pnpm format`); do not run ESLint / type check (see the global standard).

```
P0 Prereqs ─► P1 Skeleton+Login ─► P2 Report list ─► P3 Report detail ─► P4 Actions ─┐
                                                                                     ├─► P7 Wrap-up
                                       P5 User page (depends on P1, P4 ConfirmModal) ─┤
                                       P6 Health (depends only on P1) ────────────────┘
```

P5 and P6 do not depend on each other and can be swapped or done in parallel.

### P0 Prereqs: Backend Integration Environment (0.25 day)

No portal code is written; handle the external conditions first, otherwise P1 onward will be blocked.

- Set `ADMIN_TOKEN` (≥ 32 chars) in the backend `.env`, and add `http://localhost:5174` to `ALLOWED_ORIGINS` (§2.3, §8).
- Verify with curl: `GET /v1/admin/metrics` with the correct token returns `200`; a browser preflight (`OPTIONS`) with `Authorization` passes.
- Prepare seed data: create two accounts via `POST /auth/device`, and use `POST /v1/reports` to create at least 1 report with chat history and 1 without.

**Acceptance**: curl can read metrics; both reports (with / without evidence messages) exist; the CORS preflight raises no error.

### P1 Skeleton + Login (0.75 day)

**Scope**

- Vite + React + TS project init: `App.tsx` → `app.tsx`, `export const App`; install HeroUI, Tailwind, Less, `react-router`, `axios`, `zustand`, Vitest + RTL; `pnpm dev` = `vite --port 5174 --strictPort`.
- `.env.example`, `.env.development`; throw at startup when `VITE_API_BASE` is missing (§5.1).
- `api/errors.ts` (`ApiError`: status, code, details, requestId, retryAfter), `api/client.ts` (Bearer, error normalization, clear session on `401` after login), `api/types.ts` (all types from §3.2).
- `session/sessionStore.ts`: the token is stored only in `sessionStorage`, `login()` / `logout()` (§5.2).
- `router.tsx` + `RequireAuth` (preserving `redirect`), `AdminShell` (header: logout, user id lookup box; the lookup box is a placeholder for now and gets wired in P5).
- `i18n/` skeleton (`zh-Hant`, formal written Chinese).
- `/login`: probe with `GET /admin/metrics`; route `404` / `401` / `429` (countdown and disabled button) / network error; show the hint from the 5th failure on (§4.2).

**Deliverable**: can log in and out; redirected to `/login` when not logged in; other routes are temporarily empty pages.

**Acceptance**

- Manual: `ADMIN_TOKEN` unset → "Admin console not enabled"; wrong token → "Incorrect token"; 11 consecutive attempts → `429` countdown, during which even the correct token is rejected.
- Vitest: `ApiError` normalization (including `Retry-After`, `details.field`); `sessionStore` branches and logout clearing `sessionStorage`.
- Confirm in DevTools that the token is not in `localStorage` / cookies / URLs.

### P2 Report List (0.5 day)

**Scope**

- `api/endpoints/reports.ts`: `listReports` (`status`, `before`, `limit`).
- Shared components: `StatusChip`, `ReasonChip`, `IdTag` (shortened id + click to copy the full id), `TimeText` (absolute + relative).
- `/reports`: Open / All tabs, table (§4.3 columns, red for `target.open_reports ≥ 3`), keyset "Load more" (hidden when `has_more=false`), refresh, empty state, error card (showing `X-Request-Id`).
- Clicking a row → `/reports/:id` (this page arrives in P3; a 404 placeholder is fine until then).

**Acceptance**

- Manual: create more than 50 open reports to verify pagination (or temporarily lower `limit`); no stale data lingers when switching tabs; when offline, show the error card + retry.
- Vitest: refetch on tab switch, "Load more" uses the last item's `id` as `before`, the button is hidden when `has_more=false`.

### P3 Report Detail + Evidence (0.75 day)

**Scope**

- `getReport` (including `evidence`).
- `/reports/:id`: Header, Detail (plain text), Target card (link to `/users/:id`), Evidence (§4.4 item 4): Title, avatar (`referrerPolicy="no-referrer"`, `loading="lazy"`, placeholder on failure), chat-style messages (**reversed to oldest → newest**, two sides by `sender_id`), image thumbnails that enlarge on click, both the `evidence == null` and empty-`messages` notices, the snapshot notice bar.
- Closed reports show the read-only outcome and `resolved_at`.
- `404` → "Report does not exist" + back to list.

**Acceptance**

- Manual: both reports (with / without chat history) display correctly; `detail` / `body` containing `<script>` or HTML characters is shown verbatim as text.
- Vitest: Evidence rendering — reverse order, `null` evidence, empty messages, `kind=image`.

### P4 Actions (0.75 day)

**Scope**

- `dismissReport`, `banFromReport` (always use `report/{id}/ban`, §3.1).
- `ConfirmModal` (generic, reused in P5): shows the full target id and the side-effect list (§3.1 Ban side effects + the "Ban limitation" hint).
- `ReportDetail/ActionBar.tsx`: only shown when `status=open`; note field (≤ 200 char counter, submission blocked when exceeded, red when `details.field=note`); Dismiss (secondary), Ban (danger, positioned apart from Dismiss); target already `banned` → Ban disabled with a hint.
- All buttons disabled while submitting; no optimistic updates.
- Idempotent handling: Dismiss returns `200` but `status !== "dismissed"` → toast "This report has already been handled" and show the latest state.
- On success show a toast, return to `/reports` and refetch.
- `404` @ ban → "User was deleted or does not exist; cannot act" and refetch (§6).

**Acceptance**

- Manual (against a real backend): dismiss → disappears from the list; ban → the target becomes `banned`, its other open reports all become `actioned`, and calling `/v1/me` with the target's token returns `403 ACCOUNT_BANNED`; double-clicking does not submit twice.
- Vitest: no actions when not open, Ban disabled for a banned target, `note` > 200 blocked, "already handled" shown when Dismiss returns a non-`dismissed` status.

### P5 User Page (0.5 day)

**Scope**

- `api/endpoints/users.ts`: `getUser`, `banUser`, `unbanUser`.
- `/users/:id`: all `AdminUser` fields, status chip, absolute + relative time; `active` → Ban, `banned` → Unban, `deleted` → no action; reuse `ConfirmModal` (the unban confirmation must state "match / hello / push subscription will not be restored").
- `404` → "User does not exist or was deleted".
- Wire up the `AdminShell` global user id lookup box and the in-page lookup box (trim before submitting; empty values are not sent).
- The "Reports against this user" link is **not implemented** (§10 gap 2); a disabled hint may be placed instead.

**Acceptance**

- Manual: ban → unban back and forth, with the status and chip updating correctly; looking up a non-existent id shows the `404` copy; the Unban confirm dialog has the "will not be restored" hint.

### P6 Health (0.5 day)

**Scope**

- `api/endpoints/metrics.ts`, `jobs.ts`.
- `/health` Metrics cards: overview / DB / Jobs / Rate limited (the red/yellow rules from §4.6; `rate_limited_total` **rendered dynamically by key**; `oldest_ready_age_ms` shows "—" when null).
- Auto-refresh every 15 seconds, paused when `document.hidden`, with an immediate catch-up fetch when returning to the foreground; plus a manual refresh button.
- Failed jobs table (`limit=50`, `last_error` truncated + expandable), strictly read-only.
- Auto-refresh stops polling on `401` (to avoid burning the failure quota, §5.2).

**Acceptance**

- Manual: no new requests in Network after switching away from the tab, and an immediate catch-up when switching back; inject a limiter key via mock to verify dynamic rendering; red when `sqlite_busy_total > 0` / `failed_total > 0`.
- Vitest: threshold color logic, null display, dynamic key rendering.

### P7 Wrap-up (0.75 day)

**Scope**

- Add `vercel.json` (SPA rewrites + security headers, §8.1) and `public/robots.txt`.
- Check the §6 error handling matrix row by row and fill gaps (global toast for `429`, the "Login expired" toast for `401` when logged in).
- Auto-logout after 30 minutes idle (optional).
- Playwright E2E: the 5 scenarios in §9.
- Review all UI copy and centralize it in `i18n/`; run `pnpm format`.
- Vercel deployment (§8.1): connect the GitHub repo, set `VITE_API_BASE`, bind `portal.kaului.com` and DNS, add `https://portal.kaului.com` to the backend's `ALLOWED_ORIGINS` and restart.

**Acceptance**: all §9 E2E tests pass; every row in §6 has a corresponding manual or automated verification; login succeeds at `https://portal.kaului.com`, images and API calls work under the CSP, and the console shows no violations; deep links (e.g. `/reports/<id>`) do not 404 on refresh; `curl -I` shows all the headers from §8.1.

### Effort Summary

| Phase | Content          | Estimate   | Depends on |
| ----- | ---------------- | ---------- | ---------- |
| P0    | Integration env  | 0.25 day   | —          |
| P1    | Skeleton + Login | 0.75 day   | P0         |
| P2    | Report list      | 0.5 day    | P1         |
| P3    | Report detail    | 0.75 day   | P2         |
| P4    | Actions          | 0.75 day   | P3         |
| P5    | User page        | 0.5 day    | P1, P4     |
| P6    | Health           | 0.5 day    | P1         |
| P7    | Wrap-up + E2E    | 0.75 day   | All        |
| Total |                  | ~4.75 days |            |

This is 1.25 days more than the old estimate (3.5 days), mainly from adding P0 integration, Evidence rendering, and the actual effort for Vitest / E2E.

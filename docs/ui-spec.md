# UI Spec: Kaului Portal

Upstream: `portal-spec.md` §4 (screens), §6 (error handling), §7 (misoperation protection); implementation builds on `phase-1-spec.md` (shell + login already landed).

This document defines the **visual language, shared components, and the layout and states of every screen**. Functional behavior (endpoints, error routing, security rules) is governed by `portal-spec.md`; it is only referenced here, not repeated.

Note on UI copy: user-facing strings quoted in this document are English glosses. The shipped copy is `zh-Hant` and lives in `src/i18n/zhHant.ts`.

---

## 1. Design Principles

1. **Single operator, few clicks, no accidental bans**: dangerous actions are visually separated from ordinary ones, and always require a second confirmation.
2. **Information density first**: an admin console is not a consumer product; tables are compact, text is small, decoration is minimal.
3. **Black and white base, color only expresses status**: apart from status colors (red / yellow / green / gray), no brand color is introduced.
4. **Every async block needs four states**: loading, empty, error, success. Never leave it blank.
5. **Desktop first**, and degrade gracefully on narrow screens (header wraps, tables scroll horizontally); no mobile-specific layout.
6. **All user-provided content is plain text** (`detail`, Title, message `body`); see `portal-spec.md` §7.

---

## 2. Visual Foundations

Follow the existing implementation (`src/styles/index.css`, `AdminShell`, `Login`); new pages must not invent a separate style.

### 2.1 Technology

- Component library: HeroUI v3 (`@heroui/react`) + Tailwind v4; custom styles use Less (`.less` imports last).
- Prefer ready-made HeroUI components (`Button`, `Card`, `Alert`, `Input`, `Chip`, `Table`, `Modal`, `Tabs`, `Tooltip`, `Toast`), **following the current official docs**; do not copy old tutorials.
- Prefer Tailwind utilities for colors / spacing and avoid hard-coded hex; the only hard-coded values allowed are those in the table below.

### 2.2 Color

| Use               | Value                         | Notes                                     |
| ----------------- | ----------------------------- | ----------------------------------------- |
| Page background   | `#f2f2f2`                     | Already in `index.css`                    |
| Header background | `black`, text `white`         | Inactive nav uses `white/60`              |
| Card              | HeroUI `Card` default (white) | Outer `shadow-sm`, Login uses `lg`        |
| Primary text      | `black`                       | Secondary text `black/60`                 |
| Border            | `black/15`                    | `black` on focus                          |
| Danger            | Tailwind `red-600/700`        | Background `red-50`, border `red-200`     |
| Warning           | Tailwind `amber-600/700`      | Background `amber-50`, border `amber-200` |
| Success           | Tailwind `green-600/700`      | Background `green-50`, border `green-200` |
| Neutral / deleted | Tailwind `zinc-500/600`       | Background `zinc-100`, border `zinc-200`  |
| Info              | HeroUI `status="accent"`      | e.g. "Login expired"                      |

**Color must never be the only signal**: every status also has text (the chip label), so it does not rely on color alone (color blindness / printing).

### 2.3 Typography and Spacing

- Font: system default (Tailwind `font-sans`); no web fonts are loaded. IDs and error messages use `font-mono`.
- Sizes: page title `text-xl font-semibold`; section title `text-base font-semibold`; body `text-sm`; helper / time `text-xs text-black/60`.
- Layout container: `mx-auto max-w-7xl px-4 sm:px-6` (consistent with the shell); vertical spacing between content is `gap-4`, inside cards `gap-3`.
- Corner radius: cards `rounded-2xl` (HeroUI Card default); chips / buttons follow HeroUI defaults.

### 2.4 Motion

- Use only HeroUI's default transitions (hover, modal enter/exit); **do not add** page transitions or animations other than skeleton shimmer.
- Respect `prefers-reduced-motion`.

---

## 3. Global Shell (already implemented, spec supplement)

```
┌──────────────────────────────────────────────────────────────┐
│ Kaului Console   Reports  Health      [user id lookup][Look up][Log out] │  black
└──────────────────────────────────────────────────────────────┘
│  <main>  max-w-7xl                                            │
```

- Active nav: `font-semibold text-white`; the rest are `text-white/60`, turning white on hover.
- `/reports/:id` belongs to "Reports"; `/users/:id` highlights no nav item (there is no corresponding nav).
- User id lookup box (wired in P5): shown at `md` and above; hidden below `md`, where lookup moves to the top of the `/users/:id` page (see §7.4). Enter = submit; input is `trim()`med, empty values are not sent; after submit navigate to `/users/<id>` without clearing the input.
- "Log out": an outline button; clicking logs out immediately, **no confirmation needed** (a pure client action with no side effects).
- The header is not sticky (admin pages are of limited length; this reduces occlusion).

---

## 4. Shared Components (created in P2 / P4)

One file per component (`components/XxxYyy.tsx`); all copy goes through `i18n`.

### 4.1 `StatusChip`

Handles report status and user status uniformly, so colors are not written twice.

| Category     | Value       | Label (gloss) | Color |
| ------------ | ----------- | ------------- | ----- |
| ReportStatus | `open`      | Pending       | amber |
| ReportStatus | `dismissed` | Dismissed     | zinc  |
| ReportStatus | `actioned`  | Actioned      | green |
| UserStatus   | `active`    | Active        | green |
| UserStatus   | `banned`    | Banned        | red   |
| UserStatus   | `deleted`   | Deleted       | zinc  |

Props: `{kind: "report" | "user"; value: ReportStatus | UserStatus}`. An unknown value (added by the backend) → show the raw string in zinc, **do not throw**.

### 4.2 `ReasonChip`

| Value           | Label (gloss)      |
| --------------- | ------------------ |
| `spam`          | Spam               |
| `harassment`    | Harassment         |
| `inappropriate` | Inappropriate      |
| `underage`      | Suspected underage |
| `other`         | Other              |

- `underage` uses red (most severe, review first); the rest are neutral (black text, `black/15` border).
- Unknown values are handled the same as in `StatusChip`.

### 4.3 `IdTag`

- Shows the **last 8 characters** of the UUID (the backend uses UUIDv7, whose first 8 hex chars are the high timestamp bits, so IDs created in the same batch share a prefix and cannot be told apart by eye), `font-mono text-xs`, e.g. `9c1e7a4b`; if shorter than 8, show as is.
- Click copies the **full** id; the button briefly changes to "Copied" (1.5 seconds). If copying fails (no clipboard permission) → no error; the tooltip shows the full id so it can be selected manually.
- Hover tooltip shows the full ID.
- `<button type="button">`, keyboard operable (Enter / Space), `aria-label` "Copy ID".
- Table rows are themselves clickable for navigation, so `IdTag` clicks must `stopPropagation` to avoid copying and navigating at the same time.

### 4.4 `TimeText`

- Props: epoch **milliseconds**.
- Shows the `relative time` (primary), with the absolute time (`YYYY-MM-DD HH:mm:ss`, browser local time zone) in `title` / tooltip.
- User page / detail page show both: `2026-11-07 14:03:21 (3 hours ago)`, switched with prop `mode="both"`.
- Relative time granularity: `< 1 minute` just now; `< 1 hour` N minutes ago; `< 24 hours` N hours ago; `< 30 days` N days ago; otherwise show the absolute date.
- Future times (clock skew) → show "just now", never a negative number.
- Render as `<time dateTime>`. No live ticking (MVP); it updates when the page refetches.

### 4.5 `ConfirmModal` (created in P4, reused in P5)

A generic second-step confirmation dialog.

```
┌────────────────────────────────────┐
│ Ban user                      [ ✕ ] │
├────────────────────────────────────┤
│ Target user                         │
│ 0192f3a1-xxxx-xxxx-xxxx-xxxxxxxxxxxx │  ← full text, font-mono, selectable
│                                    │
│ This action will:                   │
│  • Close all of their active matches … │
│  • …                               │
│ ⚠ Accounts are device-based, …      │  ← warning Alert
├────────────────────────────────────┤
│                  [Cancel] [Confirm ban] │  ← confirm button is danger
└────────────────────────────────────┘
```

Props: `title`, `targetId`, `consequences: string[]`, `warning?: string`, `confirmLabel`, `tone: "danger" | "default"`, `pending`, `onConfirm`, `onCancel`.

- **Default focus is on "Cancel"** (prevents accidental confirmation by Enter).
- While `pending`: both buttons are disabled, the confirm button shows a spinner, and the modal **cannot** be closed with Esc / backdrop click.
- Errors are not swallowed inside the modal: if `onConfirm` throws, the modal stays open and shows a danger `Alert` inside (`message` + `X-Request-Id`); the user can retry or cancel.
- Confirm button `tone="danger"` is solid red; `default` (e.g. unban) is solid black.
- The target ID must be shown in **full** (`portal-spec.md` §7).
- Source of the side-effect copy: `portal-spec.md` §3.1; Ban and Unban each have their own set, stored in `i18n`.

---

## 5. State Conventions (all pages)

| State   | Presentation                                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Loading | First load: skeleton (5 table rows / gray card blocks); refresh: keep old content + a spinner at the top right, **do not clear** |
| Empty   | Centered, `text-black/60`, one sentence of explanation + an optional secondary action; no emoji                                  |
| Error   | `ErrorCard`: title (per `portal-spec.md` §6), `X-Request-Id` (`font-mono`, copyable), "Retry" button                             |
| Success | Content + Toast for the action result                                                                                            |

- **`ErrorCard`** is a shared component (`components/ErrorCard.tsx`). Props: `{error: ApiError; onRetry?: () => void; title?: string}`. For `429` it additionally shows a countdown.
- **Toast**: top right, auto-dismiss after 4 seconds; error toasts do not auto-dismiss until closed manually. At most 3 stacked at a time.
- **Button pending**: use HeroUI `isPending`; while any mutation is submitting, all buttons in the same area are disabled (prevents double clicks, `portal-spec.md` §5.1).
- **Switching tabs / routes**: clear old data first and then show loading, to avoid leftover content from the previous tab (a P2 acceptance item).
- **Focus management**: after a route change, move focus to the page title (`tabIndex={-1}`), for keyboard / screen reader users.

---

## 6. `/login` (already implemented)

A centered card on a `#f2f2f2` background; above it a lock icon (black rounded square) + title + subtitle; inside the card: expired info bar (conditional), token field, error `Alert`, login button.

- The error `Alert` uses the danger palette (`red-50` background, `red-200` border, `red-700` text); see `src/pages/Login/index.tsx`.
- When an error appears, the token field border turns `red-300`.
- During the `429` countdown the button is disabled, the label embeds the seconds, and the error disappears when it reaches zero.
- The error routing copy and conditions follow `phase-1-spec.md` §5.3.
- This document does not change this page and uses it only as the visual baseline: **cards, error bars, and input fields on other pages must be consistent with this page**.

---

## 7. Screen Specs

### 7.1 `/reports` Report Queue (P2)

```
Report queue                                       [Refresh]
[ Pending ] [ All ]                                           ← Tabs
┌──────────────────────────────────────────────────────────┐
│ Time      Reason     Reported            Repeat Reporter  Status   │
│ 3 min ago Harassment 9c1e7a4b [Active]   ② …    5d03b2f8  Pending  │
│ 1 hr ago  Spam       e41a60c7 [Banned]   ③  …   2b8f9d13  Actioned │
└──────────────────────────────────────────────────────────┘
                       [ Load more ]
```

**Table columns** (per `portal-spec.md` §4.3):

| Column   | Content                                            | Align |
| -------- | -------------------------------------------------- | ----- |
| Time     | `TimeText`                                         | Left  |
| Reason   | `ReasonChip`                                       | Left  |
| Reported | `IdTag` + `StatusChip(user)`                       | Left  |
| Repeat   | `target.open_reports`; **≥ 3 red bold + red chip** | Right |
| Reporter | `IdTag`                                            | Left  |
| Status   | `StatusChip(report)`                               | Left  |

**Interaction**

- The whole row is clickable → `/reports/:id`; `cursor-pointer`, hover `bg-black/5`; an `IdTag` inside the row does not trigger navigation (§4.3). The row uses `<a>` / `role="link"` so middle-click and Cmd+Click open a new tab.
- Tabs: **Pending** (default) / **All**; the tab state syncs to the URL `?status=open|all`, persists on refresh, and the browser back button works.
- "Load more": centered below the table, an outline button; `isPending` while loading; hidden when `has_more=false` (**do not** show an "no more" message).
- "Refresh": top right; resets the list to the first page.
- Narrow screens: wrap the table in `overflow-x-auto` and keep columns from wrapping.

**States**

| State             | Presentation                                                        |
| ----------------- | ------------------------------------------------------------------- |
| Loading (first)   | Table header + 5 skeleton rows                                      |
| Empty (Pending)   | "No pending reports"                                                |
| Empty (All)       | "No reports yet"                                                    |
| Error             | `ErrorCard` + retry (in the list area; tabs remain usable)          |
| Load-more failure | Inline error + "Retry" below the table, **keeping** the loaded rows |

### 7.2 `/reports/:id` Report Detail (P3, P4)

Desktop two columns (`lg:grid-cols-3`): the left 2 columns = content; the right 1 column = Target card + action bar (sticky `top-4`); `< lg` is a single column in the order: Header → Detail → Target → Actions → Evidence.

```
← Back to report queue
┌─ Header ───────────────────────────────┐ ┌─ Reported user ─────┐
│ [Harassment] [Pending]  Created: … Closed: … │ │ 0192f3a1 [Active]   │
├─ Report description ───────────────────┤ │ Pending reports: 3  │
│ (plain text)                           │ │ [View user →]       │
├─ Evidence ─────────────────────────────┤ ├─ Action ────────────┤
│ ℹ Evidence is a snapshot at report time, not updated │ │ Note (optional) 12/200 │
│ Title: xxx        [Avatar]              │ │ [____________]      │
│ ┌ Chat (old→new) ────────────────────┐ │ │ [Dismiss]           │
│ │ Reporter: …          (left, gray bubble) │ │ │                     │
│ │           Reported: … (right, white bubble) │ │ │ ──────────────────  │
│ └────────────────────────────────────┘ │ │ [Ban user]  ← danger │
└────────────────────────────────────────┘ └─────────────────────┘
```

**Header card**: `ReasonChip` + `StatusChip`; created time (`TimeText mode="both"`); for closed reports add "Resolved time".

**Report description**: `detail` rendered as plain text with `whitespace-pre-wrap break-words`; `null` → "(No description)" in `text-black/60`.

**Target card**: `IdTag` (here showing the full id with `font-mono text-xs break-all`), `StatusChip(user)`, pending report count (red when ≥ 3), and "View user" linking to `/users/:id`.

**Evidence**

- Top info bar: "Evidence is a snapshot at report time and is not updated", always visible.
- Title: `text-base`, `null` → "(No Title)". Avatar 48×48 circle: `referrerPolicy="no-referrer"`, `loading="lazy"`; on `onError` or `null` → a gray-background person icon placeholder.
- Chat: **old → new** (reversed by the frontend). Split into sides by `sender_id`:
    - Reporter: left-aligned, `bg-black/5`, small "Reporter" label above.
    - Reported: right-aligned, white background + `border-black/15`, small "Reported" label above.
    - Each message has a `TimeText` (`text-xs`) at the bottom.
    - `kind=text`: plain text, `whitespace-pre-wrap break-words`; `body` null → "(Empty message)".
    - `kind=image`: thumbnail (max `160×160`, `object-cover`, `rounded-lg`), `referrerPolicy="no-referrer"`, `loading="lazy"`; clicking opens a lightbox (HeroUI `Modal`) with a large image `max-h-[80vh]`, closed by Esc / backdrop. On image load failure → an "Image failed to load" placeholder.
    - **Never put `image_url` / `avatar_url` in `href`** (`portal-spec.md` §7).
- The chat container is `max-h-[480px] overflow-y-auto`, scrolled to the bottom (newest) by default.
- Two empty states: `evidence == null` → "Evidence exceeded the retention period (90 days) and was purged"; empty `messages` → "No chat history between the two parties".

**Action bar** (sticky card in the right column, P4)

| `report.status` | Presentation                           |
| --------------- | -------------------------------------- |
| `open`          | Note field + Dismiss + Ban             |
| `dismissed`     | Read-only: "Dismissed" + resolved time |
| `actioned`      | Read-only: "Actioned" + resolved time  |

- Note: `TextArea` (2 rows), with a right-aligned `n/200` counter below; when `> 200` the counter turns red, **both buttons are disabled**, and the field gets a red border + "Note is limited to 200 characters"; a backend `400 details.field=note` is likewise highlighted red and shows the message.
- **Dismiss**: a secondary button (black border, white background), full width. Clicking submits directly (highly reversible, no modal needed).
- **Ban user**: solid red danger, full width, **separated from Dismiss by `my-4` plus a divider line** (`portal-spec.md` §7: not adjacent). Clicking opens `ConfirmModal` (§4.5) with `tone="danger"`.
- `target.status === "banned"`: the Ban button is disabled, with a `text-xs` hint below: "User is already banned".
- While submitting: all buttons and the note field in the whole action card are disabled.
- Success: Toast "Dismissed" / "Banned" → return to `/reports` (`replace`, triggering a refetch).
- Dismiss returns `200` but `status !== "dismissed"`: **do not** return to the list; update in place to show the latest state, with a Toast (warning) "This report has already been handled".
- `404` @ ban: the modal shows "User was deleted or does not exist; cannot act", and the detail is refetched after closing.

**States**

| State   | Presentation                                                       |
| ------- | ------------------------------------------------------------------ |
| Loading | One skeleton card each for Header / Detail / Evidence              |
| 404     | Centered "Report does not exist" + a "Back to report queue" button |
| Error   | `ErrorCard` + retry                                                |

### 7.3 Ban / Unban Confirm Dialog Content

**Ban** (shared by the report page and user page, P4)

- Title: "Ban user"
- Side-effect list (`portal-spec.md` §3.1):
    - Closes all of the user's active matches (the other side only sees the match disappear)
    - The user's pending hellos expire silently
    - Deletes the user's push subscriptions
    - **All** pending reports against the user are auto-closed (actioned)
    - The user's open real-time connections are dropped immediately
    - The reporter is **not** notified
- Warning: "Accounts are device-based. A banned user can create a new account, so banning does not mean the problem is solved."
- Confirm button: "Confirm ban" (danger).

**Unban** (user page, P5)

- Title: "Unban user"
- Content: "After unbanning, the user can use the app again."
- Warning: "Matches, hellos, and push subscriptions that were closed earlier will **not be restored**; the Title / profile will come back naturally."
- Confirm button: "Confirm unban" (default, black).

### 7.4 `/users/:id` User (P5)

```
[ Look up by user id ____________ ][Look up]                  ← page top (the only entry below md)
┌──────────────────────────────────────────────┐
│ 0192f3a1-xxxx-xxxx-xxxx-xxxxxxxxxxxx [Active] │
├──────────────────────────────────────────────┤
│ Created             2026-11-07 14:03 (3 days ago)   │
│ Last active         2026-11-10 09:12 (2 hours ago)  │
│ Inbox count         4                         │
│ Pending reports     1                         │
│ Total reports       5                         │
│ Has active Title    Yes                       │
├──────────────────────────────────────────────┤
│ [Ban user]                                    │
│ Reports against this user (not yet supported) │
└──────────────────────────────────────────────┘
```

- All `AdminUser` fields are rendered as a description list (`dl`); label `text-black/60`, value `text-black`; `Pending reports ≥ 3` is red.
- The ID is shown in full + a copy button.
- Actions:
    - `active` → "Ban user" (danger, opens `ConfirmModal`).
    - `banned` → "Unban user" (solid black, opens `ConfirmModal`).
    - `deleted` → no actions shown; a gray note "User was deleted; cannot act".
    - The note field follows the §7.2 rules (≤ 200).
- "Reports against this user": a disabled text link + tooltip "Requires backend support", **not clickable**.
- Lookup box: `trim`, empty values are not sent, Enter submits; on `404` the page shows a centered empty state "User does not exist or was deleted", and the **lookup box stays usable** (so another lookup can be done right away).
- Ban / unban success: Toast + **refetch in place** (no navigation); the chip and button update immediately.
- `404` @ ban / unban: Toast (error) "User was deleted or does not exist; cannot act" + refetch.

### 7.5 `/health` System Health (P6)

```
System health                    Updated 5 seconds ago   [Refresh]
┌Overview────┐┌DB──────────────┐┌Jobs────────────┐┌Rate limited──┐
│ Uptime     ││ Write wait (ms)││ ready   0      ││ api       0   │
│ 3d 4h      ││ p50 p95 p99 max││ locked  0      ││ admin_fail 2 ⚠│
│ SSE conns 12││ busy 0        ││ failed  0      ││ … (dynamic)   │
│ 5xx   0    ││                ││ oldest —       ││               │
│            ││                ││ latency as DB  ││               │
└────────────┘└────────────────┘└────────────────┘└──────────────┘
Failed jobs (dead-letter)
┌ kind  attempts  last error (truncated)   failed at ────────────┐
```

- Card grid: `xl:grid-cols-4 md:grid-cols-2 grid-cols-1`; each card has a title + data rows.
- Numbers use `tabular-nums`, right-aligned, `font-mono`.
- **Threshold colors** (color combined with text / icon):

| Metric                          | Condition | Presentation                                        |
| ------------------------------- | --------- | --------------------------------------------------- |
| `db.sqlite_busy_total`          | `> 0`     | Red + "⚠"                                           |
| `jobs.failed_total`             | `> 0`     | Red + "⚠"                                           |
| `rate_limited_total.api`        | `> 0`     | Yellow + tooltip "Check whether the PWA is polling" |
| `rate_limited_total.admin_fail` | `> 0`     | Yellow + tooltip "Someone is hitting the token"     |
| `oldest_ready_age_ms`           | `null`    | "—"                                                 |

- `rate_limited_total` is rendered row by row **dynamically** by key, **without hard-coding key names**; no keys → "No rate-limit records".
- `Hist` display: `p50 / p95 / p99 / max` (ms), with `count` as a tooltip.
- Human-readable uptime: `N days N hours`, `N hours N minutes`, `N minutes`.
- At the top, "Updated N seconds ago" + manual refresh; the auto-refresh rules (15 seconds, paused on `document.hidden`, stopped on `401`) follow `portal-spec.md` §4.6 / P6. During auto-refresh **keep the old data** and do not flicker.
- Failed jobs table: columns `kind` (`font-mono`), `attempts` (right-aligned), `last_error`, `failed_at` (`TimeText mode="both"`). `last_error` is truncated to 2 lines by default (`line-clamp-2`); "Expand / Collapse" is only shown when it overflows; when expanded it uses `font-mono text-xs whitespace-pre-wrap break-words`. `null` → "—". Strictly read-only, **no action buttons at all**.
- Empty state (failed jobs): "No failed jobs".
- The metrics and jobs requests handle errors **independently**: one failing does not affect the other, each with its own `ErrorCard`.

### 7.6 404 Page (already implemented)

Centered: title "This page could not be found" + a "Back to report queue" button. Keep as is.

---

## 8. Accessibility

- All interactive elements are keyboard operable, with a visible focus ring (do not use `outline-none` without a replacement).
- Icon-only buttons must have an `aria-label`.
- Tables use a semantic `<table>` (HeroUI `Table`); clickable rows must contain a real `<a>` (§7.1).
- State changes (Toast, error bars) use `role="status"` / `role="alert"`: success / info = `status`, errors = `alert`.
- Modal: focus trap, Esc closes (except while `pending`), and focus returns to the triggering element on close.
- Color contrast ≥ WCAG AA (`text-black/60` on `#f2f2f2` is about 4.6:1; **do not make it any lighter**).
- Image `alt`: avatar "Avatar", chat image "Chat image"; user content is never placed in `alt`.

---

## 9. Responsive

| Breakpoint    | Behavior                                                                              |
| ------------- | ------------------------------------------------------------------------------------- |
| `< sm` (640)  | Header nav wraps to the bottom; tables scroll horizontally; detail is a single column |
| `< md` (768)  | The global user id lookup box is hidden (the user page has one at the top)            |
| `< lg` (1024) | Detail page is a single column, and the action card is not sticky                     |
| `≥ xl` (1280) | Health uses four columns                                                              |

Do not widen beyond `max-w-7xl`.

---

## 10. Copy (i18n) Rules

- All visible text lives in `i18n/zhHant.ts`; components contain **zero hard-coded Chinese** (`phase-1-spec.md` §8).
- New keys are grouped by page: `reports.*`, `reportDetail.*`, `user.*`, `health.*`, `common.*` (chip labels, `ErrorCard`, Toast, time formats).
- Tone: formal written Traditional Chinese by default; keep the Cantonese phrasing already settled for certain hints (e.g. "can't connect to server", "can't find"). Use consistent terms across the whole site for the same concept:
    - Ban / unban terms are the Chinese equivalents (do not use the English words ban / unban in the UI)
    - Dismiss (dismissed), actioned
    - Reported user (target), reporter
- Dynamic copy uses `t(key, {param})` interpolation; do not concatenate strings.

---

## 11. Acceptance Checklist (UI level)

**Visual consistency**

- [ ] New page cards, error bars, and input fields match `/login` (§2, §6).
- [ ] Status chips across the site are rendered only through `StatusChip` / `ReasonChip`, with no inline duplicate color logic.
- [ ] Status is not expressed by color alone.

**Interaction**

- [ ] Every async block has loading / empty / error states (§5).
- [ ] While any mutation is submitting, buttons in the same area are disabled; a double click submits only once.
- [ ] `ConfirmModal` defaults focus to Cancel; cannot be closed while `pending`; the target ID is shown in full.
- [ ] There is a separator between the Ban and Dismiss buttons, and Ban is visually danger-colored.
- [ ] `IdTag` click only copies and does not trigger row navigation.
- [ ] Tab state is written to the URL, and refresh / back button behave correctly.

**Content safety**

- [ ] `<script>` and HTML characters in `detail` / `body` / Title are displayed verbatim as text.
- [ ] `image_url` / `avatar_url` are only used in `<img src>` and never appear in any `href`.
- [ ] All images carry `referrerPolicy="no-referrer"` and `loading="lazy"`, with a placeholder on failure.

**Accessibility / responsive**

- [ ] Keyboard alone can complete: login → open a report → dismiss / ban (including the modal).
- [ ] Check widths 1280 / 1024 / 768 / 375 one by one, with no horizontal overflow (except scrolling inside tables).
- [ ] All icon-only buttons have an `aria-label`.

**Repo**

- [ ] After `pnpm format`, `git diff` shows no formatting changes.
- [ ] No hard-coded Chinese inside components (verify with `grep`).

---

## 12. Out of Scope for This Document

- Backend gaps (user list, by-target reports, `admin_actions` browsing): see `portal-spec.md` §10; the UI only places disabled placeholders.
- Dark mode (not in the MVP).
- Mobile-specific layout.
- Language switching (`zh-Hant` only).
- Brand logo / favicon design (keep the existing lock icon).

import {expect, test, type Page} from "@playwright/test";
import {t} from "../src/i18n";
import {ADMIN_TOKEN, API_BASE, chat, fileReport, getMeStatus, registerAccount, suffix, type Account} from "./seed";

async function login(page: Page, token = ADMIN_TOKEN) {
    await page.getByLabel(t("login.tokenLabel")).fill(token);
    await page.getByRole("button", {name: t("login.submit")}).click();
}

async function loginAndOpen(page: Page, path: string) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await login(page);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
}

// Matches a translated string whose params are digits, e.g. a countdown.
function digits(key: Parameters<typeof t>[0], param: string) {
    const escaped = t(key, {[param]: "\u0000"}).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${escaped.replace("\u0000", "\\d+")}$`);
}

const openReportLink = (page: Page, reportId: string) => page.getByRole("link", {name: t("reports.openReport", {id: reportId.slice(-8)})});

// Scenarios depend on each other (shared accounts, shared IP limit) and #5 locks the IP, so order is fixed.
test.describe.serial("portal against a real backend", () => {
    let reporter: Account;
    let dismissTarget: Account & {titleId: string};
    let banTarget: Account & {titleId: string};

    test.beforeAll(async () => {
        const id = suffix();
        reporter = await registerAccount(`e2e reporter ${id}`);
        dismissTarget = await registerAccount(`e2e target a ${id}`);
        banTarget = await registerAccount(`e2e target b ${id}`);
    });

    test("1. login, reload, logout", async ({page}) => {
        await page.goto("/reports");
        await expect(page).toHaveURL(/\/login\?redirect=%2Freports$/);
        await login(page);
        await expect(page).toHaveURL(/\/reports$/);
        await expect(page.getByRole("heading", {name: t("reports.title")})).toBeVisible();

        await page.reload();
        await expect(page).toHaveURL(/\/reports$/);
        await expect(page.getByRole("button", {name: t("shell.logout")})).toBeVisible();

        await page.getByRole("button", {name: t("shell.logout")}).click();
        await expect(page).toHaveURL(/\/login$/);
    });

    test("2. dismiss a report", async ({page}) => {
        await chat(reporter, dismissTarget);
        const reportId = await fileReport(reporter, dismissTarget, `e2e dismiss ${suffix()}`);

        await loginAndOpen(page, "/reports");
        await openReportLink(page, reportId).click();
        await expect(page).toHaveURL(new RegExp(`/reports/${reportId}$`));
        await expect(page.getByText("e2e first (reporter)")).toBeVisible();
        await expect(page.getByText("e2e second (target)")).toBeVisible();

        await page.getByRole("button", {name: t("reportActions.dismiss")}).click();
        await expect(page).toHaveURL(/\/reports$/);
        await expect(openReportLink(page, reportId)).toHaveCount(0);
    });

    test("3. ban from a report", async ({page}) => {
        const reportId = await fileReport(reporter, banTarget, `e2e ban ${suffix()}`);

        await loginAndOpen(page, `/reports/${reportId}`);
        await page.getByRole("button", {name: t("reportActions.ban")}).click();
        const dialog = page.getByRole("dialog", {name: t("banConfirm.title")});
        await expect(dialog).toContainText(banTarget.id);
        await dialog.getByRole("button", {name: t("banConfirm.confirm")}).click();
        await expect(page).toHaveURL(/\/reports$/);
        await expect(openReportLink(page, reportId)).toHaveCount(0);

        await page.goto(`/reports/${reportId}`);
        await expect(page.getByText(t("common.status.actioned")).first()).toBeVisible();

        const me = await getMeStatus(banTarget);
        expect(me).toEqual({status: 403, code: "ACCOUNT_BANNED"});
    });

    test("4. unban from the user page", async ({page}) => {
        await loginAndOpen(page, `/users/${banTarget.id}`);
        await expect(page.getByText(t("common.status.banned")).first()).toBeVisible();

        await page.getByRole("button", {name: t("user.unban")}).click();
        const dialog = page.getByRole("dialog", {name: t("unbanConfirm.title")});
        await expect(dialog).toContainText(t("unbanConfirm.warning"));
        await dialog.getByRole("button", {name: t("unbanConfirm.confirm")}).click();

        await expect(page.getByText(t("common.status.active")).first()).toBeVisible();
        await expect(page.getByText(t("common.status.banned"))).toHaveCount(0);
    });

    // Must stay last: it locks this IP out of admin login for about a minute.
    test("5. failed-login rate limit", async ({page}) => {
        await page.goto("/login");
        const input = page.getByLabel(t("login.tokenLabel"));
        const submit = page.getByRole("button", {name: t("login.submit")});

        for (let attempt = 1; attempt <= 10; attempt++) {
            await input.fill(`wrong-${attempt}`);
            await submit.click();
            await expect(input).toHaveValue("");
        }
        await input.fill("wrong-11");
        await submit.click();

        const cooling = page.getByRole("button", {name: digits("login.cooldownButton", "seconds")});
        await expect(cooling).toBeDisabled();
        await expect(page.getByRole("alert")).toHaveText(digits("login.errorRateLimited", "seconds"));
        // Login probes have their own countdown; no global toast on top.
        await expect(page.getByText(digits("common.rateLimitedToast", "n"))).toHaveCount(0);

        await input.fill(ADMIN_TOKEN);
        await expect(cooling).toBeDisabled();
        const direct = await fetch(`${API_BASE}/v1/admin/metrics`, {headers: {Authorization: `Bearer ${ADMIN_TOKEN}`}});
        expect(direct.status).toBe(429);
    });
});

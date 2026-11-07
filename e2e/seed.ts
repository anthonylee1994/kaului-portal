// Seeds a LOCAL / staging backend through its public API. There is no delete API, so test data stays in the DB.

export const API_BASE = process.env.E2E_API_BASE ?? "http://localhost:8080";
export const ADMIN_TOKEN = process.env.E2E_ADMIN_TOKEN ?? "";

export interface Account {
    id: string;
    token: string;
}

async function call<T>(token: string | null, method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            ...(token ? {Authorization: `Bearer ${token}`} : {}),
            ...(body === undefined ? {} : {"content-type": "application/json"}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}`);
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
}

export function suffix(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function registerAccount(title: string): Promise<Account & {titleId: string}> {
    const created = await call<{user_id: string; token: string}>(null, "POST", "/v1/auth/device");
    const token = created.token;
    await call(token, "PATCH", "/v1/me", {gender: "male", birth_year: 1995});
    await call(token, "PUT", "/v1/me/profile", {show_gender: false, tags: ["coffee"]});
    const made = await call<{id: string}>(token, "PUT", "/v1/titles/mine", {body: title});
    return {id: created.user_id, token, titleId: made.id};
}

// A greets B, B accepts, they exchange messages: gives the report real evidence.
export async function chat(a: Account, b: Account & {titleId: string}): Promise<string> {
    const hello = await call<{hello_id: string}>(a.token, "POST", `/v1/titles/${b.titleId}/hello`, {message: "e2e hello"});
    const match = await call<{id: string}>(b.token, "POST", `/v1/hellos/${hello.hello_id}/accept`);
    await call(a.token, "POST", `/v1/matches/${match.id}/messages`, {body: "e2e first (reporter)"});
    await call(b.token, "POST", `/v1/matches/${match.id}/messages`, {body: "e2e second (target)"});
    return match.id;
}

// Files the report, then reads its id back from the admin queue (POST /v1/reports answers 204 with no body).
export async function fileReport(reporter: Account, target: Account, detail: string): Promise<string> {
    await call(reporter.token, "POST", "/v1/reports", {target_user_id: target.id, reason: "harassment", detail});
    const list = await call<{items: {id: string; detail: string | null}[]}>(ADMIN_TOKEN, "GET", "/v1/admin/reports?status=open&limit=100");
    const found = list.items.find(item => item.detail === detail);
    if (!found) throw new Error("seeded report not found in the open queue");
    return found.id;
}

export async function getMeStatus(account: Account): Promise<{status: number; code: string | null}> {
    const response = await fetch(`${API_BASE}/v1/me`, {headers: {Authorization: `Bearer ${account.token}`}});
    const body = (await response.json().catch(() => null)) as {error?: {code?: string}} | null;
    return {status: response.status, code: body?.error?.code ?? null};
}

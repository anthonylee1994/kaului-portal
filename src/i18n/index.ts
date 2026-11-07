import {zhHant} from "./zhHant";

type Join<K extends string, P extends string> = `${K}.${P}`;

type Paths<T> = {
    [K in keyof T & string]: T[K] extends string ? K : Join<K, Paths<T[K]>>;
}[keyof T & string];

export type TextKey = Paths<typeof zhHant>;

export function t(key: TextKey, params?: Record<string, string | number>): string {
    let value: unknown = zhHant;
    for (const part of key.split(".")) {
        if (typeof value !== "object" || value === null || !(part in value)) {
            throw new Error(`Missing i18n key: ${key}`);
        }
        value = (value as Record<string, unknown>)[part];
    }
    if (typeof value !== "string") {
        throw new Error(`Missing i18n key: ${key}`);
    }
    if (!params) return value;
    return value.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

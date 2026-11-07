import {apiClient} from "../client";
import {buildNoteBody} from "@/lib/noteRules";
import type {AdminUser, BanResponse, UnbanResponse} from "../types";

export async function getUser(id: string): Promise<AdminUser> {
    const response = await apiClient.get<AdminUser>(`/admin/users/${encodeURIComponent(id)}`);
    return response.data;
}

// Always the user-scoped ban (audited as ban), never /reports/{id}/ban.
export async function banUser(id: string, note = ""): Promise<BanResponse> {
    const response = await apiClient.post<BanResponse>(`/admin/users/${encodeURIComponent(id)}/ban`, buildNoteBody(note));
    return response.data;
}

export async function unbanUser(id: string, note = ""): Promise<UnbanResponse> {
    const response = await apiClient.post<UnbanResponse>(`/admin/users/${encodeURIComponent(id)}/unban`, buildNoteBody(note));
    return response.data;
}

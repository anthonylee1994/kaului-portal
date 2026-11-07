import {toast} from "@heroui/react";

// The only place components may raise toasts: success and warning use the default timeout,
// errors stay until dismissed (ui-spec §5).
export function notifySuccess(message: string): void {
    toast.success(message);
}

export function notifyWarning(message: string): void {
    toast.warning(message);
}

export function notifyError(message: string): void {
    toast.danger(message, {timeout: 0});
}

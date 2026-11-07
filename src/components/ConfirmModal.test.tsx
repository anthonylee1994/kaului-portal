import React from "react";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {ApiError} from "@/api/errors";
import {ConfirmModal} from "./ConfirmModal";

const targetId = "0192f3a1-7c2e-7b4d-ac33-000000000001";

function setup(props: Partial<React.ComponentProps<typeof ConfirmModal>> = {}) {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
        <ConfirmModal
            isOpen
            title="封鎖用戶"
            targetId={targetId}
            consequences={["效果一", "效果二"]}
            warning="注意事項"
            confirmLabel="確認封鎖"
            tone="danger"
            pending={false}
            error={null}
            onConfirm={onConfirm}
            onCancel={onCancel}
            {...props}
        />
    );
    return {onConfirm, onCancel, user: userEvent.setup()};
}

describe("ConfirmModal", () => {
    it("shows the full target id, every consequence and the warning", () => {
        setup();
        expect(screen.getByText(targetId)).toBeInTheDocument();
        expect(screen.getByText("效果一")).toBeInTheDocument();
        expect(screen.getByText("效果二")).toBeInTheDocument();
        expect(screen.getByText("注意事項")).toBeInTheDocument();
    });

    it("focuses cancel first so Enter never confirms", async () => {
        const {user, onConfirm} = setup();
        expect(screen.getByRole("button", {name: "取消"})).toHaveFocus();
        await user.keyboard("{Enter}");
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("disables both buttons and ignores Esc while pending", async () => {
        const {user, onCancel} = setup({pending: true});
        expect(screen.getByRole("button", {name: "取消"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "確認封鎖"})).toBeDisabled();
        await user.keyboard("{Escape}");
        expect(onCancel).not.toHaveBeenCalled();
    });

    it("shows the error with its request id and stays open", () => {
        const error = new ApiError({message: "boom", status: 500, code: "INTERNAL", details: null, requestId: "req-1", retryAfter: null});
        const {onCancel} = setup({error});
        expect(screen.getByRole("alert")).toHaveTextContent("req-1");
        expect(onCancel).not.toHaveBeenCalled();
    });

    it("calls onConfirm and onCancel from their buttons", async () => {
        const {user, onConfirm, onCancel} = setup();
        await user.click(screen.getByRole("button", {name: "確認封鎖"}));
        expect(onConfirm).toHaveBeenCalledOnce();
        await user.click(screen.getByRole("button", {name: "取消"}));
        expect(onCancel).toHaveBeenCalledOnce();
    });
});

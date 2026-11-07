import {toast} from "@heroui/react";
import {notifyError, notifySuccess, notifyWarning} from "./notify";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("notify", () => {
    it("notifySuccess uses the default timeout", () => {
        const spy = vi.spyOn(toast, "success").mockReturnValue("1");
        notifySuccess("ok");
        expect(spy).toHaveBeenCalledWith("ok");
    });

    it("notifyWarning uses the default timeout", () => {
        const spy = vi.spyOn(toast, "warning").mockReturnValue("1");
        notifyWarning("careful");
        expect(spy).toHaveBeenCalledWith("careful");
    });

    it("notifyError never times out", () => {
        const spy = vi.spyOn(toast, "danger").mockReturnValue("1");
        notifyError("bad");
        expect(spy).toHaveBeenCalledWith("bad", {timeout: 0});
    });
});

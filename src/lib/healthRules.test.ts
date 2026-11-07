import {dbBusySeverity, failedJobsSeverity, limiterSeverity} from "./healthRules";

describe("healthRules", () => {
    it("dbBusySeverity", () => {
        expect(dbBusySeverity(0)).toBe("ok");
        expect(dbBusySeverity(1)).toBe("danger");
    });

    it("failedJobsSeverity", () => {
        expect(failedJobsSeverity(0)).toBe("ok");
        expect(failedJobsSeverity(3)).toBe("danger");
    });

    it("limiterSeverity only colours the two known keys", () => {
        expect(limiterSeverity("api", 1)).toBe("warn");
        expect(limiterSeverity("admin_fail", 1)).toBe("warn");
        expect(limiterSeverity("api", 0)).toBe("ok");
        expect(limiterSeverity("other", 99)).toBe("ok");
    });

    it("treats non-finite numbers as ok", () => {
        expect(dbBusySeverity(Number.NaN)).toBe("ok");
        expect(failedJobsSeverity(Number.POSITIVE_INFINITY)).toBe("ok");
        expect(limiterSeverity("api", Number.NaN)).toBe("ok");
    });
});

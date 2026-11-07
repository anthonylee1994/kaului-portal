import React from "react";
import {render, screen} from "@testing-library/react";
import type {ReportReason, ReportStatus, UserStatus} from "@/api/types";
import {ReasonChip} from "./ReasonChip";
import {StatusChip} from "./StatusChip";

describe("StatusChip", () => {
    it.each<[ReportStatus, string]>([
        ["open", "待處理"],
        ["dismissed", "已駁回"],
        ["actioned", "已處置"],
    ])("report %s", (value, text) => {
        render(<StatusChip kind="report" value={value} />);
        expect(screen.getByText(text)).toBeInTheDocument();
    });

    it.each<[UserStatus, string]>([
        ["active", "正常"],
        ["banned", "已封鎖"],
        ["deleted", "已刪除"],
    ])("user %s", (value, text) => {
        render(<StatusChip kind="user" value={value} />);
        expect(screen.getByText(text)).toBeInTheDocument();
    });

    it("shows an unknown value as-is in zinc without throwing", () => {
        render(<StatusChip kind="report" value={"escalated" as ReportStatus} />);
        expect(screen.getByText("escalated")).toHaveClass("text-zinc-600");
    });

    it("does not treat prototype keys as known values", () => {
        render(<StatusChip kind="user" value={"constructor" as UserStatus} />);
        expect(screen.getByText("constructor")).toBeInTheDocument();
    });
});

describe("ReasonChip", () => {
    it.each<[ReportReason, string]>([
        ["spam", "垃圾訊息"],
        ["harassment", "騷擾"],
        ["inappropriate", "不當內容"],
        ["underage", "疑似未成年"],
        ["other", "其他"],
    ])("%s", (value, text) => {
        render(<ReasonChip value={value} />);
        expect(screen.getByText(text)).toBeInTheDocument();
    });

    it("marks underage in red and the rest not", () => {
        const {rerender} = render(<ReasonChip value="underage" />);
        expect(screen.getByText("疑似未成年")).toHaveClass("text-red-700");
        rerender(<ReasonChip value="spam" />);
        expect(screen.getByText("垃圾訊息")).not.toHaveClass("text-red-700");
    });

    it("shows an unknown value as-is", () => {
        render(<ReasonChip value={"scam" as ReportReason} />);
        expect(screen.getByText("scam")).toBeInTheDocument();
    });
});

import React from "react";
import {render, screen} from "@testing-library/react";
import {adminUserFixture} from "@/test/mockApi";
import {UserSummary} from "./UserSummary";

describe("UserSummary", () => {
    it("renders all six fields without showing the id", () => {
        const user = adminUserFixture({inbox_count: 7, open_reports: 2, total_reports: 9, has_active_title: false});
        render(<UserSummary user={user} />);
        expect(screen.queryByText(user.id)).not.toBeInTheDocument();
        expect(screen.getByText(user.title as string)).toBeInTheDocument();
        for (const label of ["建立時間", "最後活躍", "收件箱數量", "待處理舉報", "累計被舉報", "有活躍標題"]) {
            expect(screen.getByText(label)).toBeInTheDocument();
        }
        expect(screen.getByText("7")).toBeInTheDocument();
        expect(screen.getByText("9")).toBeInTheDocument();
        expect(screen.getByText("否")).toBeInTheDocument();
        expect(screen.getAllByRole("time")[0]).toHaveTextContent(/（.+）/);
    });

    it("shows 是 for an active title", () => {
        render(<UserSummary user={adminUserFixture({has_active_title: true})} />);
        expect(screen.getByText("是")).toBeInTheDocument();
    });

    it("highlights open reports at the repeat offender threshold only", () => {
        const {rerender} = render(<UserSummary user={adminUserFixture({open_reports: 3, total_reports: 50})} />);
        expect(screen.getByText("3")).toHaveClass("font-bold");
        rerender(<UserSummary user={adminUserFixture({open_reports: 2, total_reports: 50})} />);
        expect(screen.getByText("2").className).not.toContain("font-bold");
    });

    it("shows the current title, tags and avatar as plain text / img", () => {
        const user = adminUserFixture({title: "<b>hi</b>", tags: ["a", "b"], avatar_url: "https://img.example/a.jpg"});
        render(<UserSummary user={user} />);
        expect(screen.getByText("<b>hi</b>")).toBeInTheDocument();
        expect(screen.getByText("a")).toBeInTheDocument();
        expect(screen.getByText("b")).toBeInTheDocument();
        expect(screen.getByRole("img", {name: "用戶頭像"})).toHaveAttribute("src", "https://img.example/a.jpg");
    });

    it("shows placeholders without title, tags or avatar", () => {
        render(<UserSummary user={adminUserFixture({title: null, has_active_title: false, tags: [], avatar_url: null})} />);
        expect(screen.getByText("（無標題）")).toBeInTheDocument();
        expect(screen.getByText("（無）")).toBeInTheDocument();
        expect(screen.queryByRole("img", {name: "用戶頭像"})).not.toBeInTheDocument();
    });

    it("falls back to the placeholder for an unsafe avatar url", () => {
        render(<UserSummary user={adminUserFixture({avatar_url: "javascript:alert(1)"})} />);
        expect(screen.queryByRole("img", {name: "用戶頭像"})).not.toBeInTheDocument();
    });
});

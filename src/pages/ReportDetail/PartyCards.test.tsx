import React from "react";
import {render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {reportFixture} from "@/test/mockApi";
import {ReportHeader} from "./ReportHeader";
import {TargetCard} from "./TargetCard";

describe("reporter and target identity", () => {
    it("shows the reporter's title in the header", () => {
        const report = reportFixture({reporter_title: "Reporter T", reporter_avatar_url: "https://img.example/r.jpg"});
        render(<ReportHeader report={report} />, {wrapper: MemoryRouter});
        expect(screen.getByRole("link", {name: "查看用戶"})).toHaveAttribute("href", `/users/${report.reporter_id}`);
        expect(screen.getByText("舉報人")).toBeInTheDocument();
        expect(screen.getByText("Reporter T")).toBeInTheDocument();
    });

    it("shows the target's title and avatar but not the raw id", () => {
        const report = reportFixture();
        const {container} = render(
            <MemoryRouter>
                <TargetCard target={{...report.target, title: "Target T", avatar_url: "https://img.example/t.jpg"}} />
            </MemoryRouter>
        );
        expect(screen.getByText("Target T")).toBeInTheDocument();
        expect(screen.queryByText(report.target.id)).not.toBeInTheDocument();
        expect(container.querySelector("img")).toHaveAttribute("src", "https://img.example/t.jpg");
        expect(screen.getAllByRole("link", {name: "查看用戶"})[0]).toHaveAttribute("href", `/users/${report.target.id}`);
    });
});

import React from "react";
import {render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {reportFixture} from "@/test/mockApi";
import {ReportHeader} from "./ReportHeader";
import {TargetCard} from "./TargetCard";

describe("reporter and target identity", () => {
    it("shows the reporter's title in the header", () => {
        render(<ReportHeader report={reportFixture({reporter_title: "Reporter T", reporter_avatar_url: "https://img.example/r.jpg"})} />);
        expect(screen.getByText("舉報人")).toBeInTheDocument();
        expect(screen.getByText("Reporter T")).toBeInTheDocument();
    });

    it("shows the target's title and avatar plus the full id", () => {
        const report = reportFixture();
        const {container} = render(
            <MemoryRouter>
                <TargetCard target={{...report.target, title: "Target T", avatar_url: "https://img.example/t.jpg"}} />
            </MemoryRouter>
        );
        expect(screen.getByText("Target T")).toBeInTheDocument();
        expect(screen.getByText(report.target.id)).toBeInTheDocument();
        expect(container.querySelector("img")).toHaveAttribute("src", "https://img.example/t.jpg");
    });
});

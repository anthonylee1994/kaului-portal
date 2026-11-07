import React from "react";
import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {evidenceFixture, evidenceMessageFixture, reportFixture} from "@/test/mockApi";
import {EvidenceSection} from "./EvidenceSection";

const report = reportFixture();
const fromReporter = {sender_id: report.reporter_id};
const fromTarget = {sender_id: report.target.id};

function renderEvidence(messages = [evidenceMessageFixture(fromReporter)], overrides = {}) {
    const current = reportFixture({...report, evidence: evidenceFixture({messages, ...overrides})});
    return render(<EvidenceSection report={current} />);
}

describe("EvidenceSection", () => {
    it("shows messages oldest first without mutating the input", () => {
        const messages = [evidenceMessageFixture({...fromReporter, body: "m3"}), evidenceMessageFixture({...fromReporter, body: "m2"}), evidenceMessageFixture({...fromReporter, body: "m1"})];
        const before = [...messages];
        renderEvidence(messages);
        expect(screen.getAllByRole("listitem").map(item => item.textContent)).toEqual([expect.stringContaining("m1"), expect.stringContaining("m2"), expect.stringContaining("m3")]);
        expect(messages).toEqual(before);
    });

    it("labels the sender side", () => {
        renderEvidence([evidenceMessageFixture({...fromReporter, body: "a"}), evidenceMessageFixture({...fromTarget, body: "b"}), evidenceMessageFixture({sender_id: "stranger", body: "c"})]);
        // Rendered oldest first, so the input order is reversed.
        const items = screen.getAllByRole("listitem");
        expect(within(items[0]).getByText("其他")).toBeInTheDocument();
        expect(within(items[1]).getByText("被舉報人")).toBeInTheDocument();
        expect(within(items[2]).getByText("舉報人")).toBeInTheDocument();
    });

    it("shows the expired note and no chat when evidence is null", () => {
        render(<EvidenceSection report={reportFixture({evidence: null})} />);
        expect(screen.getByText("證據已超過保留期限（90 日），已被清除")).toBeInTheDocument();
        expect(screen.queryByRole("list")).not.toBeInTheDocument();
        expect(screen.getByRole("note")).toHaveTextContent("快照");
    });

    it("treats a missing evidence field like null", () => {
        render(<EvidenceSection report={reportFixture()} />);
        expect(screen.getByText("證據已超過保留期限（90 日），已被清除")).toBeInTheDocument();
    });

    it("shows the title and an empty chat note when there are no messages", () => {
        renderEvidence([], {title: "My title"});
        expect(screen.getByText("My title")).toBeInTheDocument();
        expect(screen.getByText("雙方沒有聊天紀錄")).toBeInTheDocument();
    });

    it("falls back for a null title and a null body", () => {
        renderEvidence([evidenceMessageFixture({...fromReporter, body: null})], {title: null});
        expect(screen.getByText("（無 Title）")).toBeInTheDocument();
        expect(screen.getByText("（空白訊息）")).toBeInTheDocument();
    });

    it("treats an unknown kind as text", () => {
        renderEvidence([evidenceMessageFixture({...fromReporter, kind: "video" as "text", body: "clip"})]);
        expect(screen.getByText("clip")).toBeInTheDocument();
    });

    it("opens the lightbox from a thumbnail and closes it with Esc", async () => {
        const user = userEvent.setup();
        renderEvidence([evidenceMessageFixture({...fromReporter, kind: "image", body: null, image_url: "https://example.com/a.png"})]);
        await user.click(screen.getByRole("button", {name: "放大圖片"}));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("img")).toHaveAttribute("src", "https://example.com/a.png");
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("shows a placeholder, not a button, when image_url is null", () => {
        renderEvidence([evidenceMessageFixture({...fromReporter, kind: "image", body: null, image_url: null})]);
        expect(screen.getByText("圖片無法載入")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "放大圖片"})).not.toBeInTheDocument();
    });

    it("renders HTML in the body and title as plain text", () => {
        const html = '<script>alert(1)</script><img src=x onerror="alert(2)">&amp;';
        const {container} = renderEvidence([evidenceMessageFixture({...fromReporter, body: html})], {title: html});
        expect(screen.getAllByText(html)).toHaveLength(2);
        expect(container.querySelector("script")).toBeNull();
        expect(container.querySelector("img")).toBeNull();
    });
});

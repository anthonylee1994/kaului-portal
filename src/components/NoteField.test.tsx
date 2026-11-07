import React from "react";
import {render, screen} from "@testing-library/react";
import {NoteField} from "./NoteField";

function setup(props: Partial<React.ComponentProps<typeof NoteField>> = {}) {
    return render(<NoteField id="n" value="" onChange={() => {}} disabled={false} serverError={null} {...props} />);
}

describe("NoteField", () => {
    it("shows the character count", () => {
        setup({value: "  abc "});
        expect(screen.getByText("3/200")).toBeInTheDocument();
        expect(screen.getByLabelText("備註（選填）")).toHaveAttribute("aria-invalid", "false");
    });

    it("flags a note above 200 characters", () => {
        setup({value: "a".repeat(201)});
        expect(screen.getByText("201/200")).toBeInTheDocument();
        expect(screen.getByText("備註最多 200 字")).toBeInTheDocument();
        expect(screen.getByLabelText("備註（選填）")).toHaveAttribute("aria-invalid", "true");
    });

    it("shows the server error under the field", () => {
        setup({serverError: "note too long"});
        expect(screen.getByRole("alert")).toHaveTextContent("note too long");
        expect(screen.getByLabelText("備註（選填）")).toHaveAttribute("aria-invalid", "true");
    });

    it("disables the textarea", () => {
        setup({disabled: true});
        expect(screen.getByLabelText("備註（選填）")).toBeDisabled();
    });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PhotoReadPanel from "../PhotoReadPanel";
import { EMPTY_RECORD } from "@/lib/health/store";
import { normaliseRead } from "@/lib/health/photoRead";

vi.mock("@/lib/byokInvoke", () => ({ invokeWithByokRetry: vi.fn() }));

const read = normaliseRead(
  {
    summary: "two things stood out in those photographs.",
    findings: [
      {
        title: "patch with an uneven edge",
        plain: "there is a patch on the arm whose border is not even.",
        detail: "the outline wanders rather than staying round.",
        category: "surface",
        severity: "clinician",
        imageConfidence: 0.8,
        meaningConfidence: 0.7,
        photoIndex: 0,
        systems: ["integumentary"],
        regions: ["left forearm"],
      },
    ],
    limits: ["a photograph cannot show depth."],
    questions: ["how long has it been there?"],
  },
  [{ id: "a", label: "left arm", width: 800, height: 1200, dataUrl: "data:image/jpeg;base64,AAA" }],
  "look at this patch",
);

const recordWithRead = { ...EMPTY_RECORD, photoReads: [read] };

describe("PhotoReadPanel", () => {
  it("shows the read-out in plain language with its provenance and limits", () => {
    render(
      <PhotoReadPanel
        record={recordWithRead}
        persist={() => {}}
        resolveByok={async () => undefined}
        onAsk={() => {}}
      />,
    );
    expect(screen.getByText("patch with an uneven edge")).toBeTruthy();
    expect(screen.getByText(/border is not even/)).toBeTruthy();
    expect(screen.getByText(/take this to a clinician/)).toBeTruthy();
    expect(screen.getByText(/from "left arm"/)).toBeTruthy();
    expect(screen.getByText(/cannot show depth/)).toBeTruthy();
  });

  it("quotes a finding into the assistant when asked about", () => {
    const asked: string[] = [];
    render(
      <PhotoReadPanel
        record={recordWithRead}
        persist={() => {}}
        resolveByok={async () => undefined}
        onAsk={(l) => asked.push(l)}
      />,
    );
    fireEvent.click(screen.getByText("patch with an uneven edge"));
    fireEvent.click(screen.getByText(/ask asherin about this/));
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("patch with an uneven edge");
    expect(asked[0]).toContain('"left arm"');
  });

  it("cannot be run with no photographs attached", () => {
    render(
      <PhotoReadPanel
        record={EMPTY_RECORD}
        persist={() => {}}
        resolveByok={async () => undefined}
        onAsk={() => {}}
      />,
    );
    expect((screen.getByText("read these").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });
});

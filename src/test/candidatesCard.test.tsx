import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CandidatesCard, INTEL_SELECT_EVENT } from "@/components/chatCards/CandidatesCard";
import { parseChatCards } from "@/lib/chatCards/parseChatCards";

const payload = {
  title: "2 identities match “Rebecca Newton”",
  note: "Select one to run the full dossier.",
  unattributed: 3,
  candidates: [
    {
      id: "c1", option: 1, name: "Rebecca Newton", score: 1, documents: 2, domains: 2,
      initials: "RN", avatar: "https://media.licdn.com/pfp.jpg",
      slots: [
        { label: "Age", value: "58", state: "value", confidence: "CORROBORATED", domains: 2 },
        { label: "Job", value: "not recorded in searched registries", state: "absent" },
      ],
      family: ["Asher Newton"], matchedOn: ["address 2004 SW 23RD COURT"],
      sources: [{ domain: "fastpeoplesearch.com", url: "https://fastpeoplesearch.com/a" }],
      confirm: "Confirmed identity: Rebecca Newton, 58.",
    },
    {
      id: "c2", option: 2, name: "Rebecca Newton", score: 0.75, documents: 2, domains: 2,
      initials: "RN", slots: [{ label: "Age", value: "31", state: "value", confidence: "REPORTED", domains: 1 }],
      family: [], matchedOn: [], sources: [], confirm: "Confirmed identity: Rebecca Newton, 31.",
    },
  ],
};

describe("CandidatesCard", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("parses the candidates fence as a known card", () => {
    const segs = parseChatCards("intro\n\n```card:candidates\n" + JSON.stringify(payload) + "\n```\n");
    expect(segs.some((s: any) => s.type === "card" && s.cardType === "candidates")).toBe(true);
  });

  it("renders every option with slots and never hot-links a remote avatar", () => {
    render(<CandidatesCard payload={payload as any} />);
    expect(screen.getByText("Option 1")).toBeTruthy();
    expect(screen.getByText("Option 2")).toBeTruthy();
    expect(screen.getByText("58")).toBeTruthy();
    expect(screen.getByText(/CORROBORATED/)).toBeTruthy();
    expect(document.querySelector("img")).toBeNull(); // no third-party face fetch from this device
    expect(screen.getByText(/3 document\(s\) matched the name/)).toBeTruthy();
  });

  it("dispatches the server-authored confirm prompt once", () => {
    const spy = vi.fn();
    window.addEventListener(INTEL_SELECT_EVENT, spy as EventListener);
    render(<CandidatesCard payload={payload as any} />);
    const btn = screen.getByLabelText(/Option 2: Rebecca Newton/);
    fireEvent.click(btn);
    fireEvent.click(btn); // double-submit guard
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0][0] as CustomEvent).detail.prompt).toBe("Confirmed identity: Rebecca Newton, 31.");
    window.removeEventListener(INTEL_SELECT_EVENT, spy as EventListener);
  });

  it("renders nothing for an empty payload", () => {
    const { container } = render(<CandidatesCard payload={{ candidates: [] } as any} />);
    expect(container.textContent).toBe("");
  });
});

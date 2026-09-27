import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { parseChatCards } from "@/lib/chatCards/parseChatCards";
import ChatCardRenderer from "@/components/chatCards/ChatCardRenderer";

const stream = `Here is the tree.

\`\`\`card:relationship
{
  "subject": "Asher Shepherd Newton — Cape Coral, FL",
  "nodes": [
    { "id": "subject", "label": "Asher Shepherd Newton", "detail": "Age 20 · Cape Coral, Lee County, FL",
      "attributes": [
        { "label": "Address", "value": "Cape Coral, FL 33991" },
        { "label": "Employer", "value": "AI automation freelancer" },
        { "label": "Email", "value": "no public record found" },
        { "label": "Businesses", "value": "no Sunbiz/OpenCorporates registration found" },
        { "label": "Court records", "value": "no public record found" }
      ] },
    { "id": "p2", "label": "Jennifer R. Newton", "detail": "Parent tier",
      "attributes": [ { "label": "Address", "value": "Cape Coral, FL" }, { "label": "Phone", "value": "no public record found" } ] }
  ],
  "edges": [
    { "from": "subject", "to": "p2", "label": "Relative", "confidence": "verified",
      "sources": [{ "title": "fastpeoplesearch", "url": "https://www.fastpeoplesearch.com/" }] }
  ]
}
\`\`\`
`;

describe("relationship tree card", () => {
  it("parses and renders nodes with dossier attributes", () => {
    const segs = parseChatCards(stream);
    const card = segs.find((s) => s.type === "card");
    expect(card && (card as any).cardType).toBe("relationship");
    render(<ChatCardRenderer segment={card as any} source="chat:aureon" />);
    expect(screen.getByText("Intelligence tree")).toBeTruthy();
    expect(screen.getByText("Asher Shepherd Newton")).toBeTruthy();
    expect(screen.getByText("Jennifer R. Newton")).toBeTruthy();
    expect(screen.getByText("Employer")).toBeTruthy();
    expect(screen.getByText("Businesses")).toBeTruthy();
    expect(screen.getByText("Court records")).toBeTruthy();
    expect(screen.getByText("verified")).toBeTruthy();
    expect(screen.getByText("fastpeoplesearch")).toBeTruthy();
  });
});

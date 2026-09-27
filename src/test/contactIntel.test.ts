import { describe, it, expect } from "vitest";
import { buildContactIntel, parseAddressList } from "@/components/dashboard/google/modules/contactIntel/messageIntel";

const H = 3_600_000;
const D = 86_400_000;
const now = Date.now();

describe("parseAddressList", () => {
  it("keeps quoted display names containing commas intact", () => {
    const r = parseAddressList('"Newton, Asher" <asher@zia.io>, plain@b.co');
    expect(r).toHaveLength(2);
    expect(r[0].email).toBe("asher@zia.io");
    expect(r[0].name).toBe("Newton, Asher");
    expect(r[1].email).toBe("plain@b.co");
  });
  it("drops non-addresses instead of minting phantoms", () => {
    expect(parseAddressList("undisclosed-recipients:;")).toHaveLength(0);
    expect(parseAddressList(undefined)).toHaveLength(0);
  });
});

describe("buildContactIntel — live-shaped corpus", () => {
  const own = ["me@asherin.com"];

  // A real two-way working relationship: 6 exchanges over 30 days.
  const msgs: any[] = [];
  for (let i = 0; i < 6; i++) {
    const base = now - (30 - i * 5) * D;
    msgs.push({
      id: `in${i}`, threadId: `t${i}`, from: "Dana Cole <dana@vector.co>", to: "me@asherin.com",
      subject: `Contract review deadline`, snippet: "Hi — we must close this urgently, the deadline is Friday. Thanks!",
      internalDate: base, isUnread: i > 3,
    });
    msgs.push({
      id: `out${i}`, threadId: `t${i}`, from: "me@asherin.com", to: "Dana Cole <dana@vector.co>",
      subject: `Re: Contract review deadline`, snippet: "Thanks Dana, I will definitely send the proposal tomorrow. Regards.",
      internalDate: base + 2 * H,
    });
  }
  // A newsletter that must never outrank a human.
  for (let i = 0; i < 20; i++) {
    msgs.push({
      id: `bulk${i}`, threadId: `b${i}`, from: "Deals <no-reply@shop.io>", to: "me@asherin.com",
      subject: "SALE ends today!!!", snippet: "Save now! Amazing offers!", internalDate: now - i * D, isBulk: true,
    });
  }
  // A silent contact who used to be weekly — must read as drift, not as zero.
  for (let i = 0; i < 5; i++) {
    msgs.push({
      id: `old${i}`, threadId: `o${i}`, from: "Sam Ruiz <sam@old.org>", to: "me@asherin.com",
      subject: "Weekly sync", snippet: "Maybe we could possibly meet again sometime?",
      internalDate: now - (200 - i * 7) * D,
    });
  }

  const { dossiers, summary } = buildContactIntel({
    contacts: [
      { name: "Dana Cole", emails: ["dana@vector.co", "d.cole@vector.co"], phones: ["+1 415 555 0100"], organization: "Vector", jobTitle: "Counsel", city: "Austin", country: "US" } as any,
      { name: "Priya Raman", emails: ["priya@quiet.dev"], phones: [], organization: "Quiet Labs" } as any,
    ],
    messages: msgs,
    ownAddresses: own,
    calendarAttendees: ["dana@vector.co"],
  });

  const dana = dossiers.find((d) => d.name === "Dana Cole")!;
  const bulk = dossiers.find((d) => d.emails.includes("no-reply@shop.io"))!;
  const sam = dossiers.find((d) => d.name === "Sam Ruiz")!;
  const priya = dossiers.find((d) => d.name === "Priya Raman")!;

  it("never turns the operator into their own contact", () => {
    expect(dossiers.some((d) => d.emails.includes("me@asherin.com"))).toBe(false);
  });

  it("resolves direction from the From address, not inbox labels", () => {
    expect(dana.inbound).toBe(6);
    expect(dana.outbound).toBe(6);
    expect(dana.reciprocity).toBe(0.5);
  });

  it("fuses address-book identity with live traffic on one key", () => {
    expect(dana.emails).toEqual(expect.arrayContaining(["dana@vector.co", "d.cole@vector.co"]));
    expect(dana.phones.length).toBe(1);
    expect(dana.organization).toBe("Vector");
    expect(dana.channels).toEqual(expect.arrayContaining(["email", "phone", "calendar", "address-book"]));
  });

  it("measures real reply latency inside shared threads", () => {
    expect(dana.myReplyLatencyHours).toBe(2);
  });

  it("ranks a reciprocal human above a high-volume newsletter", () => {
    expect(bulk.total).toBe(20);
    expect(dana.total).toBe(12);
    expect(dana.importance).toBeGreaterThan(bulk.importance);
    expect(bulk.tier).not.toBe("inner");
  });

  it("excludes bulk mail from the language corpus", () => {
    expect(bulk.psych.evidence).toBe("none");
    expect(bulk.psych.composites.warmth).toBeNull();
  });

  it("detects drift against a contact's own rhythm", () => {
    expect(sam.cadenceDays).toBe(7);
    expect(sam.silenceDays).toBeGreaterThan(150);
    expect(sam.driftRatio!).toBeGreaterThan(2.5);
    expect(sam.signals.some((s) => s.label.includes("Overdue") || s.label.includes("One-way"))).toBe(true);
  });

  it("keeps a zero-traffic address-book contact rather than dropping them", () => {
    expect(priya).toBeDefined();
    expect(priya.tier).toBe("archive");
    expect(priya.total).toBe(0);
    // Identity alone carries weight — being in the book is evidence — but it
    // must stay far below any real correspondent.
    expect(priya.importance).toBeGreaterThan(0);
    expect(priya.importance).toBeLessThan(dana.importance / 3);
    expect(priya.cadenceDays).toBeNull(); // absent, not a fabricated zero
  });


  it("produces psycholinguistic readings with an evidence weight", () => {
    expect(["thin", "moderate", "strong"]).toContain(dana.psych.evidence);
    expect(dana.psych.dimensions.urgency).toBeGreaterThan(0);
    expect(dana.psych.dimensions.gratitude).toBeGreaterThan(0);
    expect(dana.psych.composites.warmth).not.toBeNull();
  });

  it("emits hedged-language markers for tentative correspondents", () => {
    expect(sam.psych.dimensions.tentativeness).toBeGreaterThan(0);
  });

  it("returns no NaN anywhere in the ledger", () => {
    const s = JSON.stringify({ dossiers, summary });
    expect(s).not.toContain("NaN");
    expect(s).not.toContain("Infinity");
  });

  it("summarises tiers and message counts truthfully", () => {
    expect(summary.correspondentCount).toBe(3);
    expect(summary.messageCount).toBe(msgs.length);
    expect(summary.bulkFiltered).toBe(20);
    expect(Object.values(summary.tiers).reduce((a, b) => a + b, 0)).toBe(dossiers.length);
  });
});

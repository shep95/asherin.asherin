import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  EMPTY_PROFILE,
  REPORT_SECTIONS,
  buildBriefingSystemPrompt,
  buildBriefingUserPrompt,
  buildSetupSystemPrompt,
  countTiers,
  extractSection,
  mergeProfile,
  normalizeProfile,
  parseBriefingReport,
  parseSetupReply,
  profileIsUsable,
  relativeTime,
  reportFileName,
  sectionForTab,
} from "@/components/dashboard/briefing/briefingEngine";
import { deleteReport, insertReport, loadProfile, loadReports, saveProfile } from "@/components/dashboard/briefing/briefingStore";

describe("briefing setup conversation", () => {
  it("the setup prompt names every field and carries the profile so far", () => {
    const p = { ...EMPTY_PROFILE, company_name: "Acme", competitors: ["Globex"] };
    const s = buildSetupSystemPrompt(p);
    for (const k of ["company_name", "industry", "competitors", "key_markets", "technology_stack", "investment_interests", "tracked_people", "regulatory_bodies", "custom_topics"]) {
      expect(s).toContain(k);
    }
    expect(s).toContain("Acme");
    expect(s).toContain("Globex");
    expect(s).toContain("profile_complete");
    expect(s).toMatch(/not on a schedule/);
    expect(buildSetupSystemPrompt(EMPTY_PROFILE)).toContain("(empty)");
  });

  it("lifts the profile out of a fenced json block and strips it from the prose", () => {
    const reply = [
      "noted — Acme in cybersecurity. who are the competitors you watch?",
      "```json",
      '{"profile_complete": false, "profile": {"company_name": "Acme", "industry": "cybersecurity", "competitors": [], "key_markets": ["EU"], "technology_stack": [], "investment_interests": [], "tracked_people": [], "regulatory_bodies": [], "custom_topics": []}}',
      "```",
    ].join("\n");
    const r = parseSetupReply(reply);
    expect(r.reply).toBe("noted — Acme in cybersecurity. who are the competitors you watch?");
    expect(r.complete).toBe(false);
    expect(r.profile?.company_name).toBe("Acme");
    expect(r.profile?.key_markets).toEqual(["EU"]);
  });

  it("reads an unfenced trailing object and the completion flag", () => {
    const r = parseSetupReply('that is enough to write from.\n\n{"profile_complete": true, "profile": {"company_name": "Acme", "competitors": ["Globex", "globex", " Initech "]}}');
    expect(r.reply).toBe("that is enough to write from.");
    expect(r.complete).toBe(true);
    expect(r.profile?.competitors).toEqual(["Globex", "Initech"]);
  });

  it("a reply without json is prose only", () => {
    const r = parseSetupReply("which markets matter most?");
    expect(r.reply).toBe("which markets matter most?");
    expect(r.profile).toBeNull();
    expect(r.complete).toBe(false);
  });

  it("merging keeps earlier answers and unions lists", () => {
    const base = { ...EMPTY_PROFILE, company_name: "Acme", competitors: ["Globex"] };
    const next = mergeProfile(base, { competitors: ["Initech"], industry: "cybersecurity", company_name: "" });
    expect(next.company_name).toBe("Acme");
    expect(next.industry).toBe("cybersecurity");
    expect(next.competitors).toEqual(["Globex", "Initech"]);
    expect(profileIsUsable(EMPTY_PROFILE)).toBe(false);
    expect(profileIsUsable({ ...EMPTY_PROFILE, industry: "x" })).toBe(false);
    expect(profileIsUsable(next)).toBe(true);
  });

  it("normalizing accepts comma strings and caps item length", () => {
    const p = normalizeProfile({ company_name: "  Acme   Corp ", key_markets: "EU, US;APAC", tracked_people: ["x".repeat(200)] });
    expect(p.company_name).toBe("Acme Corp");
    expect(p.key_markets).toEqual(["EU", "US", "APAC"]);
    expect(p.tracked_people[0]).toHaveLength(80);
  });
});

const SAMPLE = `# acme — 2026-10-25

## summary
two things matter today.

## developments
- [critical] Globex announced a merger that touches Acme's EU channel.
- [significant] a draft regulation in the EU widens breach reporting.
- [monitoring] Initech hiring in APAC.
- [monitoring] nothing else moved.

## competitors
Globex and Initech.

## markets & regulation
EU reporting rules are shifting.

## technology
nothing tracked here.

## people
nothing tracked here.

## what to watch
the merger filing.

## limits
written from model knowledge with a training cutoff; no live sources were checked. verify the merger date.
`;

describe("briefing report", () => {
  it("the briefing prompt demands the eight sections, tier tags and a limits section", () => {
    const s = buildBriefingSystemPrompt();
    for (const sec of REPORT_SECTIONS) expect(s).toContain(`## ${sec.heading}`);
    expect(s).toContain("[critical]");
    expect(s).toContain("never invent urls");
    const u = buildBriefingUserPrompt({ ...EMPTY_PROFILE, company_name: "Acme", competitors: ["Globex"] }, new Date("2026-10-25T08:00:00Z"));
    expect(u).toContain("today is 2026-10-25");
    expect(u).toContain("competitors: Globex");
  });

  it("parses title, tier counts and finds no missing sections in a complete report", () => {
    const r = parseBriefingReport(SAMPLE, new Date("2026-10-25T08:00:00Z"));
    expect(r.title).toBe("acme — 2026-10-25");
    expect(r.content.startsWith("## summary")).toBe(true);
    expect(r.counts).toEqual({ critical: 1, significant: 1, monitoring: 2 });
    expect(r.missing).toEqual([]);
  });

  it("falls back to a dated title and reports missing sections", () => {
    const r = parseBriefingReport("## summary\nshort.\n\n## developments\n- [critical] x", new Date("2026-10-25T08:00:00Z"));
    expect(r.title).toBe("briefing — 2026-10-25");
    expect(r.missing).toContain("limits");
    expect(r.missing).toContain("markets & regulation");
    expect(r.counts.critical).toBe(1);
  });

  it("unwraps a whole-answer markdown fence", () => {
    const r = parseBriefingReport("```markdown\n# t\n\n## summary\nok\n```");
    expect(r.title).toBe("t");
    expect(extractSection(r.content, "summary")).toBe("ok");
  });

  it("extracts sections case-insensitively, including the one with an ampersand", () => {
    expect(extractSection(SAMPLE, "Markets & Regulation")).toBe("EU reporting rules are shifting.");
    expect(extractSection(SAMPLE, "limits")).toMatch(/^written from model knowledge/);
    expect(extractSection(SAMPLE, "absent")).toBe("");
    expect(countTiers("- [critical] a\n- [CRITICAL] b\n* [monitoring] c").critical).toBe(2);
  });

  it("a tab shows its section or says shepherd skipped it", () => {
    expect(sectionForTab(SAMPLE, "full")).toBe(SAMPLE);
    expect(sectionForTab(SAMPLE, "people")).toBe("## people\n\nnothing tracked here.");
    expect(sectionForTab("## summary\nx", "limits")).toContain('did not write a "limits" section');
  });

  it("file names and relative times are safe and plain", () => {
    expect(reportFileName("acme — 2026-10-25 / EU", "2026-10-25T08:00:00.000Z")).toBe("acme-2026-10-25-eu-2026-10-25.md");
    expect(reportFileName("", "")).toMatch(/^briefing-\d{4}-\d{2}-\d{2}\.md$/);
    const now = new Date("2026-10-25T12:00:00Z");
    expect(relativeTime("2026-10-25T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-10-25T09:00:00Z", now)).toBe("3 h ago");
    expect(relativeTime("2026-10-01T09:00:00Z", now)).toBe("2026-10-01");
    expect(relativeTime("not a date", now)).toBe("");
  });
});

describe("briefing local tables", () => {
  const uid = "33333333-3333-4333-8333-333333333333";

  it("saves a profile once, then updates the same row", async () => {
    expect(await loadProfile(uid)).toBeNull();
    const first = await saveProfile(uid, { ...EMPTY_PROFILE, company_name: "Acme", competitors: ["Globex"] });
    const second = await saveProfile(uid, { ...first, industry: "cybersecurity" });
    expect(second.id).toBe(first.id);
    const loaded = await loadProfile(uid);
    expect(loaded?.industry).toBe("cybersecurity");
    expect(loaded?.competitors).toEqual(["Globex"]);
    expect(loaded?.tracked_people).toEqual([]);
  });

  it("reports come back newest first with numeric counts, and delete", async () => {
    const a = await insertReport({ userId: uid, title: "a", content: "## summary\nx", counts: { critical: 1, significant: 0, monitoring: 2 }, provider: "openai", model: "" });
    await new Promise((r) => setTimeout(r, 5));
    const b = await insertReport({ userId: uid, title: "b", content: "## summary\ny", counts: { critical: 0, significant: 3, monitoring: 0 }, provider: "anthropic", model: "m" });
    const rows = await loadReports(uid);
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(rows[1].critical_items).toBe(1);
    expect(rows[1].sources_checked).toBe(0);
    await deleteReport(a.id);
    expect((await loadReports(uid)).map((r) => r.id)).toEqual([b.id]);
  });
});

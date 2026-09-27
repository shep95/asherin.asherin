import { describe, expect, it } from "vitest";
import {
  confidencePhrase,
  groupFindings,
  needsClinician,
  normaliseRead,
  quoteFinding,
  suggestedSystems,
  type PhotoInRead,
} from "../photoRead";

const photos: PhotoInRead[] = [
  { id: "a", label: "left arm", width: 800, height: 1200, dataUrl: "data:image/jpeg;base64,AAA" },
  { id: "b", label: "back", width: 800, height: 1200, dataUrl: "data:image/jpeg;base64,BBB" },
];

const raw = {
  summary: "two things stood out.",
  findings: [
    {
      title: "left shoulder sits lower",
      plain: "your left shoulder looks a little lower than the right in this photo.",
      detail: "the gap between shoulder and ear is wider on the right side of the frame.",
      category: "posture",
      severity: "watch",
      imageConfidence: 0.8,
      meaningConfidence: 0.5,
      photoIndex: 1,
      systems: ["muscular", "skeletal", "not-a-system"],
      regions: ["left shoulder"],
    },
    {
      title: "patch with an uneven edge",
      plain: "there is a patch on the arm whose border is not even.",
      detail: "",
      category: "surface",
      severity: "clinician",
      imageConfidence: 2,
      meaningConfidence: -1,
      photoIndex: 0,
      systems: ["integumentary"],
      regions: [],
    },
    { title: "empty", plain: "", detail: "", category: "nonsense", severity: "unknown", photoIndex: 9 },
  ],
  limits: ["a photo cannot show depth."],
  questions: ["how long has the patch been there?"],
};

describe("normaliseRead", () => {
  const read = normaliseRead(raw, photos, "look at my shoulder and this patch");

  it("keeps only findings that actually say something", () => {
    expect(read.findings).toHaveLength(2);
  });

  it("drops system ids the atlas does not have", () => {
    expect(read.findings[0].systems).toEqual(["muscular", "skeletal"]);
  });

  it("clamps confidences into 0..1", () => {
    expect(read.findings[1].imageConfidence).toBe(1);
    expect(read.findings[1].meaningConfidence).toBe(0);
  });

  it("keeps photo attribution and rejects out-of-range indexes", () => {
    expect(read.findings[0].photoIndex).toBe(1);
    const stray = normaliseRead({ findings: [{ plain: "x", photoIndex: 7 }] }, photos, "");
    expect(stray.findings[0].photoIndex).toBe(-1);
  });

  it("never leaves the limits empty", () => {
    expect(normaliseRead({ findings: [{ plain: "x" }] }, photos, "").limits.length).toBeGreaterThan(0);
  });

  it("survives junk input", () => {
    const junk = normaliseRead(null, [], "");
    expect(junk.findings).toEqual([]);
    expect(junk.summary).toBe("");
  });
});

describe("reading the read-out", () => {
  const read = normaliseRead(raw, photos, "prompt");

  it("puts the clinician group first", () => {
    expect(groupFindings(read.findings)[0].category).toBe("surface");
  });

  it("flags a clinician finding", () => {
    expect(needsClinician(read)).toBe(true);
    expect(needsClinician(normaliseRead({ findings: [{ plain: "x", severity: "routine" }] }, photos, ""))).toBe(false);
  });

  it("collects the systems worth showing, without duplicates", () => {
    expect(suggestedSystems(read).sort()).toEqual(["integumentary", "muscular", "skeletal"]);
  });

  it("quotes a finding with its photograph and the person's own question", () => {
    const q = quoteFinding(read, read.findings[0], "should i see someone?");
    expect(q).toContain('"back"');
    expect(q).toContain("should i see someone?");
  });

  it("says plainly when the camera could barely see", () => {
    const faint = normaliseRead({ findings: [{ plain: "x", imageConfidence: 0.1, meaningConfidence: 0.9 }] }, photos, "");
    expect(confidencePhrase(faint.findings[0])).toContain("barely");
  });
});

describe("editing photographs on a stored read-out", () => {
  const photo = (id: string) => ({ id, label: id, dataUrl: `data:image/png;base64,${id}`, width: 10, height: 10 });
  const finding = (id: string, photoIndex: number) => ({
    id, title: id, plain: id, detail: "", category: "skin" as const, severity: "routine" as const,
    confidence: 0.5, photoIndex, regions: [] as string[], systems: [] as never[],
  });
  const base = {
    id: "r1", createdAt: new Date().toISOString(), prompt: "", summary: "", limits: [], questions: [],
    photos: [photo("a"), photo("b"), photo("c")],
    findings: [finding("f0", 0), finding("f1", 1), finding("f2", 2), finding("fx", -1)],
  } as never as import("../photoRead").PhotoRead;

  it("drops the deleted photograph's findings and re-points the ones after it", async () => {
    const { dropPhotoFromRead } = await import("../photoRead");
    const out = dropPhotoFromRead(base, 1)!;
    expect(out.photos.map((p) => p.id)).toEqual(["a", "c"]);
    expect(out.findings.map((f) => f.id)).toEqual(["f0", "f2", "fx"]);
    expect(out.findings.find((f) => f.id === "f2")!.photoIndex).toBe(1);
    expect(out.findings.find((f) => f.id === "fx")!.photoIndex).toBe(-1);
  });

  it("returns nothing when the last photograph goes, so no orphan read-out survives", async () => {
    const { dropPhotoFromRead } = await import("../photoRead");
    const one = { ...base, photos: [photo("a")], findings: [finding("f0", 0)] } as never as import("../photoRead").PhotoRead;
    expect(dropPhotoFromRead(one, 0)).toBeNull();
  });

  it("keeps a replaced photograph's slot but discards the lines read from the old image", async () => {
    const { replacePhotoInRead } = await import("../photoRead");
    const out = replacePhotoInRead(base, 0, photo("z"));
    expect(out.photos[0].dataUrl).toContain("z");
    expect(out.photos[0].id).toBe("a");
    expect(out.findings.map((f) => f.id)).toEqual(["f1", "f2", "fx"]);
  });
});

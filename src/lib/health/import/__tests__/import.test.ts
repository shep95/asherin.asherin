import { describe, it, expect } from "vitest";
import { parseGeneticsFile } from "../geneticsFile";
import {
  parseWearableFile,
  rollingBaseline,
  trendDirection,
  wearableFindings
} from "../wearables";
import { normaliseLabDocument } from "../labsDocument";

describe("Genetics Import", () => {
  it("should parse 23andMe TSV format and map rsids", async () => {
    const tsv = [
      "# 23andMe raw data",
      "id\tchromosome\tposition\tgenotype",
      "rs1801133\t1\t11856378\tAG", // mthfr
      "rs6025\t1\t169519049\tGG", // factor v
      "rs9939609\t16\t53820527\tAT", // known but uncatalogued
      "rs000000\t1\t1\tAA", // unmapped
    ].join("\n");

    const result = await parseGeneticsFile("genome.txt", tsv);
    expect(result.error).toBeNull();
    expect(result.variantsRead).toBe(4);
    expect(result.mapped).toBe(2);
    expect(result.knownButUncatalogued).toBe(1);
    
    const mthfr = result.entries.find(e => e.geneKey === "mthfr");
    expect(mthfr).toBeDefined();
    expect(mthfr?.genotype).toContain("AG");
    expect(mthfr?.genotype).toContain("c677t");
  });

  it("should parse VCF format", async () => {
    const vcf = [
      "##fileformat=VCFv4.2",
      "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE",
      "1\t11856378\trs1801133\tA\tG\t.\t.\t.\tGT\t0/1",
    ].join("\n");

    const result = await parseGeneticsFile("genome.vcf", vcf);
    expect(result.error).toBeNull();
    expect(result.mapped).toBe(1);
    expect(result.entries[0].geneKey).toBe("mthfr");
  });
});

describe("Wearables Import", () => {
  it("should parse Apple Health XML subset", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <HealthData>
        <Record type="HKQuantityTypeIdentifierRestingHeartRate" startDate="2023-01-01 08:00:00 +0000" value="65" unit="count/min"/>
        <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="2023-01-01 22:00:00 +0000" endDate="2023-01-02 06:00:00 +0000" value="HKCategoryValueSleepAnalysisInBed"/>
      </HealthData>`;
    
    const result = await parseWearableFile("export.xml", xml);
    expect(result.error).toBeNull();
    expect(result.series.length).toBe(2);
    
    const sleep = result.series.find(s => s.kind === "sleep");
    expect(sleep?.points[0].v).toBe(8);
  });

  it("should parse generic CSV with delimiter and date detection", async () => {
    // Testing tab delimiter and a date format without 'T'
    const csv = [
      "Timestamp\tGlucose (mg/dL)\tSteps",
      "2023-01-01 10:00:00\t105\t1000",
      "2023-01-01 11:00:00\t110\t2000",
    ].join("\n");
    
    const result = await parseWearableFile("cgm.csv", csv);
    expect(result.error).toBeNull();
    expect(result.series.length).toBe(2);
    
    const glucose = result.series.find(s => s.kind === "glucose");
    expect(glucose?.unit).toBe("mg/dl");
    expect(glucose?.points[0].t).toContain("2023-01-01T10:00:00");
  });

  it("should identify CGM CSV based on name", async () => {
    const csv = "time,Glucose\n2023-01-01 10:00:00,100";
    const result = await parseWearableFile("dexcom_export.csv", csv);
    expect(result.series[0].kind).toBe("glucose");
    expect(result.series[0].source).toBe("dexcom");
  });

  it("should downsample (capSeries) when exceeding MAX_POINTS_PER_SERIES", async () => {
    let csv = "time,hrv\n";
    for (let i = 0; i < 6000; i++) {
      const date = new Date(2020, 0, 1, 0, i);
      csv += `${date.toISOString()},${70 + (i % 10)}\n`;
    }
    
    const result = await parseWearableFile("long.csv", csv);
    const hrv = result.series[0];
    expect(hrv.points.length).toBeLessThanOrEqual(5000);
    expect(hrv.points.some(p => p.tag === "mean")).toBe(true);
  });
});

describe("Wearables Analysis", () => {
  const mockSeries = (values: number[]) => ({
    id: "test",
    kind: "hrv" as const,
    source: "test-source",
    unit: "ms",
    importedAt: new Date().toISOString(),
    points: values.map((v, i) => ({
      t: new Date(Date.now() - (values.length - i) * 86400000).toISOString(),
      v
    }))
  });

  it("should calculate rolling baseline and trend", () => {
    const series = mockSeries([50, 60, 70, 80, 90, 100]);
    const baseline = rollingBaseline(series, 30);
    expect(baseline.mean).toBe(75);
    expect(baseline.n).toBe(6);
    
    expect(trendDirection(series)).toBe("rising");
  });

  it("should generate findings for deviations", () => {
    const stable = new Array(20).fill(50);
    const series = mockSeries([...stable, 100]);
    const findings = wearableFindings([series]);
    expect(findings.length).toBe(1);
    expect(findings[0].direction).toBe("elevated");
  });
});

describe("Labs Document Normalisation", () => {
  it("should normalise with unit conversion and collection date detection", () => {
    const text = `
      Patient: John Doe
      Collected: May 15, 2023
      Glucose 5.5 mmol/L (3.9 - 5.5)
      Vitamin D 75 nmol/L
      Creatinine 80 umol/L
    `;
    
    const result = normaliseLabDocument(text);
    expect(result.collectedAt).toContain("2023-05-15");
    
    const glucose = result.values.find(v => v.key === "glucose");
    expect(glucose?.value).toBeCloseTo(99.1, 1);
    expect(glucose?.rawValue).toBe(5.5);
    expect(glucose?.rawUnit).toBe("mmol/l");
    expect(glucose?.refHigh).toBe(5.5);

    const vitD = result.values.find(v => v.key === "vitamin-d");
    expect(vitD?.value).toBeCloseTo(30, 1); // 75 * 0.4

    const creat = result.values.find(v => v.key === "creatinine");
    expect(creat?.value).toBeCloseTo(0.9, 2); // 80 * 0.0113
  });
});

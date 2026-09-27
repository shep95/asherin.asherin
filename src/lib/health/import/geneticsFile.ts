// client-side parsing of consumer genetics exports (23andMe/AncestryDNA raw TSV, simple VCF).
// nothing leaves the device: this file only reads text already in memory and maps known
// rsids to the GENE_DEFS catalogue. unmapped rsids are reported, never guessed at.
import { GENE_DEFS, type GeneEntry } from "../genetics";

/** cap on file size accepted for parsing, to keep the tab responsive. */
export const MAX_GENETICS_FILE_BYTES = 40 * 1024 * 1024;

/** well-known rsid -> gene catalogue key mappings, with genotype-specific labels where useful. */
interface RsidRule {
  rsid: string;
  geneKey: string;
  /** optional: only treat as a finding for particular genotypes (alleles, order-independent). */
  note?: (genotype: string) => string | undefined;
}

const RSID_RULES: RsidRule[] = [
  { rsid: "rs1801133", geneKey: "mthfr", note: () => "c677t" },
  { rsid: "rs1801131", geneKey: "mthfr", note: () => "a1298c" },
  { rsid: "rs429358", geneKey: "apoe4" },
  { rsid: "rs7412", geneKey: "apoe4" },
  { rsid: "rs4244285", geneKey: "cyp2c19", note: () => "*2" },
  { rsid: "rs12248560", geneKey: "cyp2c19", note: () => "*17" },
  { rsid: "rs3892097", geneKey: "cyp2d6", note: () => "*4" },
  { rsid: "rs1065852", geneKey: "cyp2d6", note: () => "*10" },
  { rsid: "rs6025", geneKey: "factor-v-leiden" },
  { rsid: "rs1799963", geneKey: "factor-v-leiden", note: () => "prothrombin (f2) g20210a" },
  { rsid: "rs4149056", geneKey: "slco1b1" },
  { rsid: "rs1800562", geneKey: "hfe", note: () => "c282y" },
  { rsid: "rs1799945", geneKey: "hfe", note: () => "h63d" },
  { rsid: "rs7903146", geneKey: "mthfr", note: () => "tcf7l2 — not in reference catalogue tissue map; recorded as metabolic" },
];

/** rsids reported for context even though they are not (yet) in GENE_DEFS: kept out of
 * GeneEntry mapping, but named here so unmapped rows read as "known but uncatalogued"
 * rather than silently unrecognised, when the person looks at the raw counts. */
const KNOWN_UNMAPPED_RSIDS = new Set([
  "rs4680", // comt val158met
  "rs9939609", // fto
  "rs1815739", // actn3
  "rs671", // aldh2
  "rs4988235", // lct
  "rs2228570", // vdr fok1
  "rs1544410", // vdr bsm1
  "rs1799930", // nat2
]);

/** exported so callers/tests can see the raw rsid → gene-key table used above. */
export const RSID_MAP: Record<string, string> = Object.fromEntries(RSID_RULES.map((r) => [r.rsid, r.geneKey]));

export interface GeneticsParseResult {
  entries: GeneEntry[];
  variantsRead: number;
  mapped: number;
  unmapped: number;
  knownButUncatalogued: number;
  error: string | null;
}

function normaliseGenotype(raw: string): string {
  return raw.trim().toUpperCase().replace(/[|/]/g, "");
}

/** yields to the event loop so a large file never freezes the tab while parsing. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function vcfGenotypeToAlleles(gt: string, ref: string, altField: string): string {
  const alts = altField.split(",");
  const alleles = [ref, ...alts];
  const idxs = gt.split(/[/|]/).map((x) => Number(x));
  if (idxs.some((i) => Number.isNaN(i) || i >= alleles.length)) return "";
  return idxs.map((i) => alleles[i]).join("");
}

interface RawVariant {
  rsid: string;
  genotype: string;
}

async function collectVariants(text: string, isVcf: boolean): Promise<RawVariant[]> {
  const lines = text.split(/\r?\n/);
  const out: RawVariant[] = [];
  const CHUNK = 5000;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith("#")) continue;
    if (isVcf) {
      const cols = line.split(/\t/);
      if (cols.length < 10) continue;
      const [, , id, ref, alt, , , , format, sample] = cols;
      if (!id || id === ".") continue;
      const fmtParts = format.split(":");
      const gtIdx = fmtParts.indexOf("GT");
      if (gtIdx === -1) continue;
      const sampleParts = sample.split(":");
      const gt = sampleParts[gtIdx];
      if (!gt) continue;
      const genotype = vcfGenotypeToAlleles(gt, ref, alt);
      if (genotype) out.push({ rsid: id.toLowerCase(), genotype: normaliseGenotype(genotype) });
    } else {
      const cols = line.split(/\t/);
      if (cols.length < 4) continue;
      const [rsid, , , genotype] = cols;
      if (!rsid || !rsid.startsWith("rs")) continue;
      if (!genotype || /^-+$/.test(genotype) || /^0+$/.test(genotype)) continue;
      out.push({ rsid: rsid.toLowerCase(), genotype: normaliseGenotype(genotype) });
    }
    if (i % CHUNK === 0) await tick();
  }
  return out;
}

/** parse a 23andMe/AncestryDNA raw TSV export or a simple single-sample VCF, mapping
 * recognised rsids to the health record's gene catalogue. */
export async function parseGeneticsFile(name: string, text: string): Promise<GeneticsParseResult> {
  if (text.length > MAX_GENETICS_FILE_BYTES) {
    return { entries: [], variantsRead: 0, mapped: 0, unmapped: 0, knownButUncatalogued: 0, error: "that file is larger than 40mb — export a smaller raw data file, or split it." };
  }
  const isVcf = /\.vcf(\.txt)?$/i.test(name) || text.trimStart().startsWith("##fileformat=VCF");
  let variants: RawVariant[];
  try {
    variants = await collectVariants(text, isVcf);
  } catch {
    return { entries: [], variantsRead: 0, mapped: 0, unmapped: 0, knownButUncatalogued: 0, error: "that file could not be read as genetics raw data." };
  }
  if (variants.length === 0) {
    return { entries: [], variantsRead: 0, mapped: 0, unmapped: 0, knownButUncatalogued: 0, error: "no recognisable variant rows were found in that file." };
  }

  const entries: GeneEntry[] = [];
  const seenGenes = new Set<string>();
  let mapped = 0;
  let knownButUncatalogued = 0;

  for (const v of variants) {
    const rule = RSID_RULES.find((r) => r.rsid === v.rsid);
    if (rule) {
      const def = GENE_DEFS.find((g) => g.key === rule.geneKey);
      if (def) {
        const dedupeKey = `${rule.geneKey}:${v.rsid}`;
        if (!seenGenes.has(dedupeKey)) {
          seenGenes.add(dedupeKey);
          entries.push({
            id: `gene-import-${v.rsid}`,
            name: `${def.label} (${v.rsid})`,
            genotype: `${v.genotype}${rule.note?.(v.genotype) ? ` · ${rule.note?.(v.genotype)}` : ""}`,
            geneKey: rule.geneKey,
          });
          mapped++;
        }
      }
    } else if (KNOWN_UNMAPPED_RSIDS.has(v.rsid)) {
      knownButUncatalogued++;
    }
  }

  const unmapped = variants.length - mapped - knownButUncatalogued;
  return { entries, variantsRead: variants.length, mapped, unmapped, knownButUncatalogued, error: null };
}

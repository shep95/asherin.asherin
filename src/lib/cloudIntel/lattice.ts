// ─────────────────────────────────────────────────────────────────────────────
// LATTICE SYNTHESIS — turns the contact ledger into findings.
//
// The ledger already computes cadence, drift, reciprocity and language markers
// per identity. What it did not do was answer "so what". This layer reads the
// finished dossiers, establishes population baselines from the subject's own
// roster, and emits findings that carry a normal, a deviation, a cause ladder,
// a consequence chain, a confidence and a falsifier.
// ─────────────────────────────────────────────────────────────────────────────

import {
  median, percentile, ordinal, robustZ, severityFromZ, confidenceFrom, rejectNull,
  silenceFinding, sortFindings, fmtDays, relativeDay, round, slope, type Finding,
} from "./logic";
import type { ContactDossier, IntelSummary } from "@/components/dashboard/google/modules/contactIntel/messageIntel";

export interface LatticeInput {
  dossiers: ContactDossier[];
  summary: IntelSummary | null;
  connected: boolean;
}

export function latticeFindings({ dossiers, summary, connected }: LatticeInput): Finding[] {
  if (!connected) {
    return [silenceFinding({
      module: "Lattice", id: "lattice-unlinked", subject: "Identity ledger",
      expected: "A linked account typically fuses 100–3,000 identities",
      cause: ["No account is linked, so neither the address book nor the traffic corpus can be read."],
      action: "Link an account under Account Mesh to build the identity ledger.",
      connected: false,
    })];
  }
  if (!summary || !dossiers.length) {
    return [silenceFinding({
      module: "Lattice", id: "lattice-empty", subject: "Identity ledger",
      expected: "100–3,000 fused identities",
      cause: [
        "The sweep returned no address-book entries and no non-bulk correspondents.",
        "The granted scopes may cover mail but not contacts, or the mailbox may be entirely bulk traffic.",
      ],
      action: "Run a deep sweep, and confirm the contacts scope is granted for the linked account.",
      connected: true,
    })];
  }

  const out: Finding[] = [];
  const corr = dossiers.filter((d) => d.total > 0);

  const importances = dossiers.map((d) => d.importance);
  const cadences = corr.map((d) => d.cadenceDays).filter((c): c is number => c != null);
  const latencies = corr.map((d) => d.myReplyLatencyHours).filter((h): h is number => h != null);
  const theirLatencies = corr.map((d) => d.theirReplyLatencyHours).filter((h): h is number => h != null);
  const reciprocities = corr.map((d) => d.reciprocity).filter((r): r is number => r != null);

  // ── 1. Inner circle: never an empty card. ────────────────────────────────
  const inner = dossiers.filter((d) => d.tier === "inner");
  if (inner.length === 0) {
    // Rule 16 — absence gets candidates and a next action, not a blank.
    const candidates = [...corr]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 5);
    out.push({
      id: "lattice-inner-empty",
      module: "Lattice",
      severity: "notable",
      title: "No identity currently clears the inner-circle threshold",
      current: "0 inner-circle relationships",
      normal: `${corr.length} active correspondents, top importance ${Math.max(0, ...importances)}/100`,
      deviation: "threshold unmet across the whole roster",
      why: [
        "Inner-circle status requires sustained two-way volume, a short reply latency, and recent contact — not raw message count.",
        candidates.length
          ? `The nearest candidate, ${candidates[0].name}, scores ${candidates[0].importance}/100; the gap is usually reciprocity or recency rather than volume.`
          : "No correspondent has enough two-way traffic in the window to be scored at all.",
        "A sampled window shorter than the relationships themselves will systematically under-rank slow, deep ties.",
      ],
      chain: {
        primary: "The ledger cannot distinguish your closest ties from routine traffic.",
        secondary: "Drift alerts fire against the wrong population.",
      },
      basis: candidates.length
        ? candidates.map((c) => `${c.name} — ${c.importance}/100, ${c.total} messages, reciprocity ${c.reciprocity != null ? Math.round(c.reciprocity * 100) : "—"}%, last contact ${c.lastSeen ? relativeDay(c.lastSeen) : "unknown"}`)
        : ["No correspondent in the sampled window carries two-way traffic."],
      confidence: confidenceFrom(dossiers.length, 1.5, 85),
      falsifier: "A deeper sweep surfacing sustained two-way history that the current window truncated.",
      action: candidates.length
        ? `Promote from the shortlist above — ${candidates.slice(0, 3).map((c) => c.name).join(", ")} are the closest to the threshold.`
        : "Widen the sweep window so slow-cadence relationships become visible.",
    });
  } else {
    const top = inner[0];
    out.push({
      id: "lattice-inner",
      module: "Lattice",
      severity: "positive",
      title: `${inner.length} identit${inner.length === 1 ? "y holds" : "ies hold"} inner-circle standing`,
      current: `${inner.length} of ${corr.length} correspondents`,
      normal: `${Math.round((inner.length / Math.max(1, corr.length)) * 100)}% of active traffic`,
      deviation: `top score ${top.importance}/100, ${ordinal(percentile(top.importance, importances))} percentile of your roster`,
      why: [
        "Inner-circle rank combines two-way volume, reply latency and recency, so a high-volume one-way sender cannot buy its way in.",
        `${top.name} leads on ${top.total} messages with ${top.reciprocity != null ? Math.round(top.reciprocity * 100) : "—"}% reciprocity.`,
      ],
      basis: inner.slice(0, 6).map((d) => `${d.name} — ${d.importance}/100, ${d.total} messages, cadence ${fmtDays(d.cadenceDays)}, last ${d.lastSeen ? relativeDay(d.lastSeen) : "unknown"}`),
      confidence: confidenceFrom(inner.reduce((a, d) => a + d.total, 0), 2, 92),
      falsifier: "A high-ranked identity turning out to be an automated sender the bulk filter missed.",
      action: "Use this set as the reference population for drift alerts below.",
    });
  }

  // ── 2. Drift against each relationship's own rhythm. ─────────────────────
  const drifting = corr
    .filter((d) => (d.driftRatio ?? 0) >= 2 && (d.cadenceDays ?? 0) > 0 && d.importance >= 25)
    .sort((a, b) => (b.driftRatio ?? 0) * b.importance - (a.driftRatio ?? 0) * a.importance);

  if (drifting.length) {
    const d0 = drifting[0];
    const z = cadences.length > 3 ? robustZ(d0.silenceDays ?? 0, cadences) : 2;
    out.push({
      id: "lattice-drift",
      module: "Lattice",
      severity: severityFromZ(z) === "baseline" ? "notable" : severityFromZ(z),
      title: `${drifting.length} significant relationship${drifting.length === 1 ? " is" : "s are"} overdue against their own rhythm`,
      current: `${d0.name}: silent ${fmtDays(d0.silenceDays)}`,
      normal: `${d0.name} normally replies every ${fmtDays(d0.cadenceDays)}`,
      deviation: `${round(d0.driftRatio ?? 0, 1)}× their established interval`,
      onset: d0.lastSeen ? `last exchange ${relativeDay(d0.lastSeen)}` : undefined,
      why: [
        "Drift is measured per-relationship, against that person's own median gap, so a monthly correspondent is not judged by a daily one's standard.",
        "A ratio above 2 means the silence is longer than the relationship has ever sustained before.",
        "Silence following a high-reciprocity history is a stronger signal than silence in a one-way thread.",
      ],
      chain: {
        primary: "The relationship is decaying without either party marking the moment.",
        secondary: "Re-engagement cost rises with every missed interval.",
        tertiary: "Past a few multiples of cadence, contacts rarely resume without deliberate outreach.",
      },
      basis: drifting.slice(0, 6).map((d) => `${d.name} — cadence ${fmtDays(d.cadenceDays)}, silent ${fmtDays(d.silenceDays)} (${round(d.driftRatio ?? 0, 1)}×), importance ${d.importance}/100`),
      confidence: confidenceFrom(drifting.length * 6, Math.abs(z), 88),
      falsifier: "Contact having continued on a channel the mesh does not read — phone, in person, or another mailbox.",
      action: `Send one message to ${d0.name} today; the interval is the thing decaying, not the relationship.`,
    });
  }

  // ── 3. Reply-latency asymmetry. ──────────────────────────────────────────
  if (latencies.length >= 5 && theirLatencies.length >= 5) {
    const mine = median(latencies);
    const theirs = median(theirLatencies);
    const ratio = theirs > 0 ? mine / theirs : 1;
    if (ratio >= 1.6 || ratio <= 0.62) {
      const slower = ratio > 1;
      out.push({
        id: "lattice-latency",
        module: "Lattice",
        severity: "notable",
        title: slower
          ? "You reply materially slower than the people writing to you"
          : "You reply materially faster than the people writing to you",
        current: `${round(mine, 1)}h your median reply`,
        normal: `${round(theirs, 1)}h their median reply`,
        deviation: `${round(ratio, 1)}× ${slower ? "slower" : "faster"}`,
        why: [
          "Latency is measured only inside matched threads, so it compares like with like rather than mailbox volume.",
          slower
            ? "A persistent lag sets the expectation that you are hard to reach, which suppresses inbound volume over time."
            : "A persistently faster reply sets an availability expectation that is expensive to sustain and costly to withdraw.",
        ],
        chain: slower
          ? { primary: "Correspondents batch or delay their asks.", secondary: "Time-sensitive items route around you." }
          : { primary: "Immediate availability becomes the assumed norm.", secondary: "Any return to normal latency reads as disengagement." },
        basis: [
          `${latencies.length} threads measured for your latency, ${theirLatencies.length} for theirs.`,
          `Your interquartile behaviour sits at the ${ordinal(percentile(mine, latencies))} percentile of your own distribution.`,
        ],
        confidence: confidenceFrom(latencies.length + theirLatencies.length, Math.abs(ratio - 1) * 2, 86),
        falsifier: "Most replies happening on another channel, which would make the mail-only latency meaningless.",
        action: slower
          ? "Pick the three highest-importance overdue threads and clear them before adding new outbound."
          : "No action required — recorded as a behavioural baseline.",
      });
    }
  }

  // ── 4. One-way relationships. ────────────────────────────────────────────
  const oneWay = corr.filter((d) => d.total >= 4 && (d.reciprocity ?? 0.5) < 0.12);
  if (oneWay.length) {
    out.push({
      id: "lattice-oneway",
      module: "Lattice",
      severity: "notable",
      title: `${oneWay.length} correspondent${oneWay.length === 1 ? " writes" : "s write"} to you and receive nothing back`,
      current: `${oneWay.length} one-way threads`,
      normal: reciprocities.length ? `${Math.round(median(reciprocities) * 100)}% median reciprocity across your roster` : "balanced two-way exchange",
      deviation: "under 12% outbound share",
      why: [
        "Reciprocity is outbound divided by total within the same identity, so a newsletter that slipped the bulk filter looks identical to an ignored human.",
        "The distinguishing test is whether the sender's messages are addressed individually — which the ledger flags separately as bulk.",
      ],
      chain: {
        primary: "Either an obligation is being missed or a bulk sender is inflating the roster.",
        secondary: "Both outcomes degrade the accuracy of every population baseline in this module.",
      },
      basis: oneWay.slice(0, 6).map((d) => `${d.name} — ${d.inbound} in / ${d.outbound} out, bulk share ${Math.round((d.bulkShare ?? 0) * 100)}%`),
      confidence: confidenceFrom(oneWay.length * 5, 1.8, 84),
      falsifier: "The sender being automated, in which case the finding is a filter gap rather than a relationship gap.",
      action: "Reply to the human ones and suppress the automated ones so the baselines stop being polluted.",
    });
  }

  // ── 5. After-hours load. ─────────────────────────────────────────────────
  const ah = summary.patterns.afterHoursShare;
  if (summary.patterns.sampleSize >= 30) {
    const effect = (ah - 0.2) / 0.1;
    const rejection = rejectNull(effect, summary.patterns.sampleSize);
    if (ah > 0.3 && rejection) {
      out.push({
        id: "lattice-afterhours",
        module: "Lattice",
        severity: ah > 0.45 ? "elevated" : "notable",
        title: `${Math.round(ah * 100)}% of your correspondence lands outside working hours`,
        current: `${Math.round(ah * 100)}% outside 08:00–18:00`,
        normal: "≈20% for a standard working pattern",
        deviation: `${Math.round((ah - 0.2) * 100)} points above the working-hours norm`,
        why: [
          `Peak transmission sits at ${summary.patterns.peakHour ?? "—"}:00 on the account's local clock.`,
          "After-hours volume of this size is structural, not incidental — it reflects either distributed time zones or a schedule that does not close.",
          "The pattern beats a coincidence explanation at the confidence shown, over the full sampled corpus.",
        ],
        chain: {
          primary: "Availability expectations extend past the working day.",
          secondary: "Correspondents calibrate their sending to your responsiveness, reinforcing the pattern.",
          tertiary: "The boundary erodes permanently once the expectation is set.",
        },
        basis: [
          `${summary.patterns.sampleSize} messages timed on the local clock.`,
          `Hour histogram peak: ${summary.patterns.peakHour ?? "—"}:00.`,
        ],
        confidence: rejection,
        falsifier: "Correspondents being in materially different time zones, which explains the timing without behavioural cause.",
        action: "Decide the boundary deliberately rather than letting the pattern decide it.",
      });
    }
  }

  // ── 6. Roster composition and coverage. ──────────────────────────────────
  const discovered = dossiers.filter((d) => !d.inAddressBook && d.total > 0);
  if (discovered.length) {
    out.push({
      id: "lattice-discovered",
      module: "Lattice",
      severity: "baseline",
      title: `${discovered.length} correspondent${discovered.length === 1 ? " exists" : "s exist"} only in traffic, never in the address book`,
      current: `${discovered.length} traffic-only identities`,
      normal: `${summary.contactCount} address-book entries`,
      deviation: `${Math.round((discovered.length / Math.max(1, corr.length)) * 100)}% of active correspondents are unfiled`,
      why: [
        "These identities were reconstructed from mail headers, not from a stored contact record.",
        "An unfiled correspondent has no name, organisation, or phone attached, so every downstream dossier about them is thinner than it needs to be.",
      ],
      basis: discovered.slice(0, 6).map((d) => `${d.name} — ${d.total} messages, ${d.emails[0] || "no address parsed"}`),
      confidence: 93,
      falsifier: "Those addresses already existing in a contact group the People scope does not return.",
      action: "File the highest-volume unfiled correspondents so their dossiers carry identity, not just traffic.",
    });
  }

  return sortFindings(out);
}

/** Weekly correspondence volume derived from dossier last-seen timestamps. */
export function correspondenceSeries(dossiers: ContactDossier[], weeks = 12): number[] {
  const series = new Array(weeks).fill(0);
  const now = Date.now();
  for (const d of dossiers) {
    if (!d.lastSeen) continue;
    const w = Math.floor((now - d.lastSeen) / (7 * 86400000));
    if (w >= 0 && w < weeks) series[weeks - 1 - w] += Math.max(1, Math.round(d.total / Math.max(1, weeks)));
  }
  return series;
}

/** Trend direction of active-relationship count, expressed per week. */
export function rosterVelocity(series: number[]): number {
  return round(slope(series), 2);
}

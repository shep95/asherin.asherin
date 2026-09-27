/**
 * /blog/asher-fold-memory — teardown of the asher.fold-memory package.
 *
 * Every claim on this page is taken from the package README and its bundled
 * selftest output. Nothing here promises a cloud-bill cut; the honest floor is
 * stated as plainly as the win.
 */
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import ArticleShell from "@/components/seo/ArticleShell";
import { BreadcrumbJsonLd, FaqJsonLd } from "@/components/seo/SeoJsonLd";
import RelatedLinks from "@/components/seo/RelatedLinks";
import orbitImage from "@/assets/asherin-fold-memory-orbit.png";

const URL = "https://asherin.com/blog/asher-fold-memory";
const TITLE = "asher.fold-memory, leftover memory, stored once";
const PUBLISHED = "2026-08-16";

const FAQ = [
  {
    q: "what does asher.fold-memory do?",
    a: "identical leftover copies are stored once. unique files stay the size they are. asking for a file back returns the original bits or a refusal.",
  },
  {
    q: "does it shrink unique files?",
    a: "no. a file with no twin is the floor. that is not a bug.",
  },
];

/* ────────────────────────── graphs ────────────────────────── */

/** Horizontal measure bar. `value` is 0–100. */
const Bar = ({
  label,
  value,
  note,
  tone = "accent",
}: {
  label: string;
  value: number;
  note?: string;
  tone?: "accent" | "muted" | "good";
}) => {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setW(value), 60);
    return () => window.clearTimeout(t);
  }, [value]);

  const fill = tone === "muted" ? "bg-muted-foreground/25" : tone === "good" ? "bg-emerald-400/50" : "bg-accent/70";

  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[11px] font-light tracking-wide text-foreground/85">{label}</p>
        <p className="shrink-0 font-mono text-[11px] text-muted-foreground">{value}%</p>
      </div>
      <div className="mt-2 h-[10px] w-full overflow-hidden rounded-full bg-background/70 ring-1 ring-inset ring-border/30">
        <div
          className={`h-full rounded-full ${fill} transition-[width] duration-1000 ease-out motion-reduce:transition-none`}
          style={{ width: `${w}%` }}
        />
      </div>
      {note && <p className="mt-1.5 text-[10px] font-extralight leading-snug text-muted-foreground/60">{note}</p>}
    </div>
  );
};

const ResultsPanel = () => (
  <figure className="my-10 rounded-2xl border border-border/15 bg-card/10 p-6 backdrop-blur-md">
    <figcaption className="mb-4">
      <p className="text-[10px] font-extralight uppercase tracking-[0.35em] text-muted-foreground/60">
        included selftest, synthetic pile
      </p>
      <p className="mt-2 text-[11px] font-extralight leading-relaxed text-muted-foreground/70">
        these are the numbers the bundled selftest printed on the reference runner. they are a measurement of a
        synthetic pile, not a scan of anyone's disk and not a forecast of your bill.
      </p>
    </figcaption>
    <Bar
      label="leftover identical text, shared middle stored once"
      value={82}
      tone="accent"
      note="the copies alias to one box. only the first copy costs anything."
    />
    <Bar
      label="unique random bytes, the floor"
      value={0}
      tone="muted"
      note="a unique original has no twin. it stays the size it is. that is not a bug."
    />
    <Bar
      label="unfold exact, or refuse"
      value={100}
      tone="good"
      note="whole-file fingerprint is re-checked on the way out. a corrupted box is refused, never approximated."
    />
  </figure>
);

/** Donut showing the honest planning bands per workload shape. */
const Donut = ({ pct, label, sub }: { pct: number; label: string; sub: string }) => {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center rounded-xl border border-border/15 bg-card/20 p-4">
      <svg viewBox="0 0 88 88" className="h-24 w-24 -rotate-90" role="img" aria-label={`${label}: ${pct}%`}>
        <circle cx="44" cy="44" r={r} fill="none" strokeWidth="7" className="stroke-border/30" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className="stroke-accent/70"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <p className="-mt-[62px] mb-[38px] font-mono text-sm text-foreground">{pct}%</p>
      <p className="text-[11px] font-light text-foreground/85">{label}</p>
      <p className="mt-1 text-center text-[10px] font-extralight leading-snug text-muted-foreground/60">{sub}</p>
    </div>
  );
};

const BandsPanel = () => (
  <figure className="my-10 rounded-2xl border border-border/15 bg-card/10 p-6 backdrop-blur-md">
    <figcaption className="mb-5 text-[10px] font-extralight uppercase tracking-[0.35em] text-muted-foreground/60">
      planning bands, upper edge of each honest range
    </figcaption>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Donut
        pct={100}
        label="copy-heavy pile"
        sub="logs, backups of backups, repeated exports. ~40-100% of the copy slice."
      />
      <Donut pct={35} label="mixed office pile" sub="documents, some logs, some photos. ~15-35% of the mixed pile." />
      <Donut pct={10} label="unique pile" sub="unique rows, original photos, encrypted disks. ~0-10%." />
    </div>
    <p className="mt-4 text-[10px] font-extralight leading-relaxed text-muted-foreground/60">
      every one of these is unsure until you sample your own pile. sample first, then decide.
    </p>
  </figure>
);

/** The ingest → unfold loop, drawn. */
const LoopPanel = () => {
  const steps = [
    { k: "cut", v: "into pieces" },
    { k: "name", v: "by the bits" },
    { k: "share", v: "twins, one box" },
    { k: "squeeze", v: "leftover air" },
    { k: "find", v: "by a hint" },
    { k: "unfold", v: "exact, or refuse" },
  ];
  return (
    <figure className="my-10 rounded-2xl border border-border/15 bg-card/10 p-6 backdrop-blur-md">
      <figcaption className="mb-4 text-[10px] font-extralight uppercase tracking-[0.35em] text-muted-foreground/60">
        the loop
      </figcaption>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.k} className="flex items-center gap-2">
            <div className="min-w-0 flex-1 rounded-lg border border-border/20 bg-card/25 px-3 py-2 text-center">
              <p className="text-[11px] font-light text-foreground">{s.k}</p>
              <p className="mt-0.5 text-[10px] font-extralight text-muted-foreground/60">{s.v}</p>
            </div>
            {i < steps.length - 1 && (
              <span aria-hidden className="hidden text-border sm:inline">
                →
              </span>
            )}
          </div>
        ))}
      </div>
    </figure>
  );
};

/* ────────────────────────── page ────────────────────────── */

const AsherFoldMemory = () => (
  <ArticleShell
    eyebrow="Release"
    title={TITLE}
    dek="identical copies stored once. unique files stay their size. unfold returns the exact bits or refuses."
    publishedLabel="16 aug 2026"
    readTime="6 min"
    image={
      <img
        src={orbitImage}
        alt="asher.fold-memory, a triangular satellite in low orbit above earth, captioned leftover memory, stored once"
        width={1080}
        height={1080}
        loading="eager"
        className="w-full max-h-[22rem] rounded-2xl border border-border/20 object-contain bg-black"
      />
    }
  >
    <BreadcrumbJsonLd
      id="asher-fold-memory"
      items={[
        { name: "asherin", url: "https://asherin.com/" },
        { name: "blog", url: "https://asherin.com/blog" },
        { name: "asher.fold-memory", url: URL },
      ]}
    />

    <p>
      most storage bills are not paid for information. they are paid for repetition, the same log line written every
      minute, the backup of a backup, the spreadsheet emailed five times, the json config copied into twenty folders.
      that is leftover: bytes that already exist somewhere else, being paid for again.
    </p>
    <p>
      <strong>asher.fold-memory</strong> is a small piece of software with one law. anything identical is stored once.
      anything unique stays exactly the size it is. and when you ask for a file back, you get the original bits or you
      get a refusal, never a lookalike.
    </p>

    <h2>what it is for</h2>
    <p>
      unique things, one photo, one encrypted vault, one original file, are the floor. they do not get smaller, and
      any tool that says otherwise is selling something. the purpose here is narrower and more honest:
    </p>
    <ul>
      <li>store shared leftover copies once.</li>
      <li>remember where they were by a cue, a hint, instead of stuffing extra copies.</li>
      <li>give the exact original bits back, or refuse.</li>
      <li>run on a laptop with no wifi for what is already held, or inside a company database on a clock.</li>
    </ul>
    <p>it is not a cloud warehouse, and it is not a zip that claims to shrink everything.</p>

    <h2>how it works</h2>
    <p>
      a file is cut into pieces. each piece is named by its exact bits. if that name is already on the shelf, no second
      box is stored, the new file just points at the first. leftover air is squeezed. a small index is kept so a hint
      can find the right pieces. on the way out they are glued in order and the whole-file name is checked again. match,
      and you get the exact file. miss, and it refuses.
    </p>

    <LoopPanel />

    <p>copies die. uniqueness stays.</p>

    <h2>tested results</h2>
    <p>
      the numbers below are the bundled selftest running on a synthetic pile: repeated text plus unique random bytes.
      they are what the software measured, not a drawing of a wish.
    </p>

    <ResultsPanel />

    <h2>the ice-cream law</h2>
    <p>
      leftover copies can be gone while the number on the invoice does not move that night. the provider bills the disk
      they rented you, not the scoops that melted. a smaller disk is a later decision, not an automatic refund.
    </p>

    <h2>the money estimate, honestly</h2>
    <p>savings track leftover copies, not "all data." pick the row that matches your pile:</p>

    <BandsPanel />

    <p className="flex gap-2.5">
      <X className="mt-1 h-4 w-4 shrink-0 text-destructive/60" />
      <span>
        what this is not: it is not "we will cut your whole cloud bill by 90%." that would only be true if almost
        everything you store were a twin. and it is not "the reported size must fall tonight." melted leftover and the
        cup on the invoice are two different things.
      </span>
    </p>
    <p>
      for context, backup-industry writeups have long put real-world copy ratios somewhere around 8:1 to 22:1, and have
      argued that a large share of enterprise growth is copy data rather than new unique data. those figures are older
      and unsure on today's exact percentages. they explain why leftover memory has a market; they are not a guarantee
      about your unique rows.
    </p>

    <h2>how to add it</h2>
    <h3>on a laptop or device</h3>
    <p>keep python 3 on the machine. no extra packages, and no wifi is needed for what is already held.</p>
    <ul>
      <li>
        <code>python fold_memory.py selftest</code>, prove it before trusting it.
      </li>
      <li>
        <code>python fold_memory.py ingest "/path/to/your/folder"</code>, put a folder in.
      </li>
      <li>
        <code>python fold_memory.py cue "leftover never deleted"</code>, recall. add <code>--trance</code> to look
        harder.
      </li>
      <li>
        <code>python fold_memory.py unfold &lt;fingerprint&gt; --out "/path/to/restored"</code>, get the exact file
        back.
      </li>
      <li>
        <code>python fold_memory.py stats</code>, see the sizes.
      </li>
    </ul>
    <p>
      the runner already skips <code>.env</code>, keys, cookies, wallets and similarly named files. do not point it at a
      password store.
    </p>

    <h3>inside your own software</h3>
    <p>
      this is backend leftover memory, not a frontend widget. add the small database closet from{" "}
      <code>add-to-postgres.sql</code>, tables for unique boxes, pointers, and a tick log, then expose three verbs:{" "}
      <strong>ingest</strong>, <strong>unfold</strong> (fingerprint or refuse), and <strong>cue</strong>. point ingest,
      unfold and delete at leftover logs and duplicate blobs, never at unique customer rows, and run it on a clock.
      never ingest secret columns: passwords, tokens, vaults, or job commands that carry keys.
    </p>

    <h2>who this saves money for</h2>
    <ul>
      <li>
        <strong>people</strong>, phone dumps, email attachments, the <em>final_final_v3</em> folder. the twins fold;
        the camera originals stay the floor.
      </li>
      <li>
        <strong>companies</strong>, nightly backups, vm clones, log pipelines, the same contract pdf sitting in ten
        shares. the gap this fills over an existing backup appliance is the memory part: cue and trance recall, plus
        fingerprint-or-refuse as a law inside the product, locally, with no wifi needed for held bytes.
      </li>
      <li>
        <strong>governments</strong>, records systems, place files, repeated xml and pdf packets. same law: copies
        fold, unique records stay, unfold must match. no claim is made here about classified networks.
      </li>
    </ul>

    <h2>what is in the pack</h2>
    <ul>
      <li>
        <code>fold_memory.py</code>, the laptop / device runner.
      </li>
      <li>
        <code>add-to-postgres.sql</code>, the starter closet for a company database, with no secrets.
      </li>
      <li>
        <code>TESTED RESULTS GRAPHS</code>, svg and html.
      </li>
      <li>the readme, in the same plain language as this page.</li>
    </ul>


    <h2>questions</h2>
    <dl className="space-y-6">
      {FAQ.map((item) => (
        <div key={item.q}>
          <dt className="text-foreground">{item.q}</dt>
          <dd className="mt-1.5">{item.a}</dd>
        </div>
      ))}
    </dl>
    <FaqJsonLd id="asher-fold-memory" items={FAQ} />

    <RelatedLinks
      heading="keep reading"
      links={[
        {
          to: "/blog",
          label: "notes from asherin",
          description: "the rest of the writing, releases, teardowns, and the reasoning behind them.",
        },
        {
          to: "/software",
          label: "what else asherin runs",
          description: "the full list of rooms and organs inside the platform.",
        },
      ]}
    />
  </ArticleShell>
);

export default AsherFoldMemory;

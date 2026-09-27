// asherin.health — deep anatomy panel: browses the fine-grained structure catalogue
// (deepAnatomy.ts), regional maps (maps.ts), development (embryology.ts), microbiome
// (microbiome.ts) and life-phase change (aging.ts). every click into a structure asks the
// body to look at it and writes a real question to the assistant — nothing here fabricates
// a personal reading.
import { useMemo, useState } from "react";
import { Search, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { HealthPanelProps } from "@/lib/health/panel";
import type { ReferenceSex } from "@/lib/health/store";
import { DEEP_GROUPS, DEEP_STRUCTURES, type DeepStructure } from "@/lib/health/deepAnatomy";
import {
  FUNCTIONAL_MAPS,
  MAP_KIND_LABELS,
  MAP_KIND_ORDER,
  mapsByKind,
  searchMaps,
  type FunctionalMapEntry,
} from "@/lib/health/maps";
import { DEVELOPMENTAL_VARIANTS, EMBRYOLOGY } from "@/lib/health/embryology";
import { MICROBIOME_LIMITS, MICROBIOME_SITES, microbiomeUserNotes } from "@/lib/health/microbiome";
import { LIFE_PHASES, phaseById } from "@/lib/health/aging";
import { EXTRA_TERRITORIES } from "@/lib/health/territoryExtra";
import { TERRITORIES } from "@/lib/health/territory";

const ALL_TERRITORY_NOTES = new Map<string, string>(
  [...TERRITORIES, ...EXTRA_TERRITORIES].filter((t) => t.note).map((t) => [t.key, t.note as string]),
);

/** a structure's note is the union of any note carried by the territories it points at. */
function structureNotes(keys: string[]): string[] {
  const notes = new Set<string>();
  for (const k of keys) {
    const n = ALL_TERRITORY_NOTES.get(k);
    if (n) notes.add(n);
  }
  return [...notes];
}

function GeometryNote({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-2">
      {notes.map((n, i) => (
        <p key={i} className="flex gap-1.5 text-[10px] font-light leading-relaxed text-amber-200/70">
          <Info className="mt-0.5 h-3 w-3 shrink-0" /> {n}
        </p>
      ))}
    </div>
  );
}

function StructureCard({
  structure,
  onOpen,
}: {
  structure: DeepStructure;
  onOpen: (s: DeepStructure) => void;
}) {
  const notes = structureNotes(structure.territoryKeys);
  return (
    <button
      onClick={() => onOpen(structure)}
      className="w-full space-y-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-left transition hover:border-white/[0.12] hover:bg-white/[0.05]"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-light text-foreground/85">{structure.name}</p>
        {structure.sex && (
          <Badge variant="outline" className="h-4 shrink-0 border-white/10 px-1.5 text-[9px] font-light text-foreground/40">
            {structure.sex}
          </Badge>
        )}
      </div>
      <p className="text-[10px] font-light leading-relaxed text-foreground/45">{structure.summary}</p>
      <GeometryNote notes={notes} />
    </button>
  );
}

function RegionalList({
  title,
  entries,
  onOpen,
}: {
  title: string;
  entries: FunctionalMapEntry[];
  onOpen: (e: FunctionalMapEntry) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">{title}</p>
      <div className="space-y-1.5">
        {entries.map((e) => {
          const notes = [...structureNotes(e.territoryKeys), e.geometryNote];
          return (
            <button
              key={e.key}
              onClick={() => onOpen(e)}
              className="w-full space-y-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 text-left transition hover:border-white/[0.12] hover:bg-white/[0.05]"
            >
              <p className="text-[11px] font-light text-foreground/80">{e.label}</p>
              <p className="text-[10px] font-light leading-relaxed text-foreground/45">{e.description}</p>
              <p className="text-[9px] font-light italic text-foreground/30">source: {e.source}</p>
              <GeometryNote notes={notes} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DeepAnatomyPanel({ record, persist, onEvent, onSelectTerritories }: HealthPanelProps) {
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<string | "all">("all");

  const referenceSex: ReferenceSex = record.settings.referenceSex;
  const lifePhaseId = record.settings.lifePhase;

  const setReferenceSex = (sex: ReferenceSex) => persist({ ...record, settings: { ...record.settings, referenceSex: sex } });
  const setLifePhase = (id: string | null) => persist({ ...record, settings: { ...record.settings, lifePhase: id } });

  const currentPhase = lifePhaseId ? phaseById(lifePhaseId) : undefined;
  const shownPhase = currentPhase ?? LIFE_PHASES[3];

  const openTerritories = (keys: string[], question: string) => {
    onSelectTerritories?.(keys);
    onEvent?.(question);
  };

  const filteredStructures = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DEEP_STRUCTURES.filter((s) => {
      if (s.sex && s.sex !== referenceSex) return false;
      if (activeGroup !== "all" && s.group !== activeGroup) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q) || s.group.toLowerCase().includes(q);
    });
  }, [query, activeGroup, referenceSex]);

  const groupsWithCounts = useMemo(() => {
    return DEEP_GROUPS.map((g) => ({
      ...g,
      count: DEEP_STRUCTURES.filter((s) => s.group === g.id && (!s.sex || s.sex === referenceSex)).length,
    })).filter((g) => g.count > 0);
  }, [referenceSex]);

  const mapsQuery = query.trim();
  const mapGroups = useMemo(
    () => MAP_KIND_ORDER.map((kind) => ({ kind, label: MAP_KIND_LABELS[kind], entries: searchMaps(mapsByKind(kind), mapsQuery) })),
    [mapsQuery],
  );
  const totalMapMatches = useMemo(() => searchMaps(FUNCTIONAL_MAPS, mapsQuery).length, [mapsQuery]);

  const notes = microbiomeUserNotes(record.exposures, record.nutrition);

  return (
    <div className="space-y-4">
      <p className="text-[11px] font-light leading-relaxed text-foreground/50">
        the fine-grained catalogue beneath the base body: sublayers, functional maps, development and the microbiome.
        reference knowledge only — every reading elsewhere in this room stays separate from what is shown here.
      </p>

      <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
        {(["male", "female"] as ReferenceSex[]).map((sex) => (
          <button
            key={sex}
            onClick={() => setReferenceSex(sex)}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-[10px] font-light uppercase tracking-[0.18em] transition",
              referenceSex === sex ? "bg-amber-400/10 text-amber-200/90" : "text-foreground/40 hover:text-foreground/60",
            )}
          >
            {sex} reference
          </button>
        ))}
      </div>
      {referenceSex === "female" && (
        <p className="text-[10px] font-light leading-relaxed text-amber-200/60">
          the loaded reference geometry is an adult male body. female-specific structures below are described from
          general anatomy but will show as not represented in the mesh until a female reference body is available.
        </p>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search structures, maps, zones…"
          className="h-8 rounded-lg border-white/[0.08] bg-white/[0.03] pl-8 text-[11px]"
        />
      </div>

      <Tabs defaultValue="structures" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-5 gap-1 bg-white/[0.03] p-1">
          <TabsTrigger value="structures" className="text-[10px]">structures</TabsTrigger>
          <TabsTrigger value="maps" className="text-[10px]">maps</TabsTrigger>
          <TabsTrigger value="development" className="text-[10px]">development</TabsTrigger>
          <TabsTrigger value="microbiome" className="text-[10px]">microbiome</TabsTrigger>
          <TabsTrigger value="phase" className="text-[10px]">life phase</TabsTrigger>
        </TabsList>

        <TabsContent value="structures" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setActiveGroup("all")}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-light transition",
                activeGroup === "all" ? "border-amber-400/30 bg-amber-400/10 text-amber-200/90" : "border-white/[0.08] text-foreground/50 hover:text-foreground/70",
              )}
            >
              all
            </button>
            {groupsWithCounts.map((g) => (
              <button
                key={g.id}
                onClick={() => setActiveGroup(g.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] font-light transition",
                  activeGroup === g.id ? "border-amber-400/30 bg-amber-400/10 text-amber-200/90" : "border-white/[0.08] text-foreground/50 hover:text-foreground/70",
                )}
                title={g.blurb}
              >
                {g.label} · {g.count}
              </button>
            ))}
          </div>
          <ScrollArea className="h-[420px] pr-2">
            <div className="space-y-2">
              {filteredStructures.length === 0 && (
                <p className="py-6 text-center text-[11px] font-light text-foreground/35">nothing matches that search.</p>
              )}
              {filteredStructures.map((s) => (
                <StructureCard
                  key={s.id}
                  structure={s}
                  onOpen={(structure) =>
                    openTerritories(
                      structure.territoryKeys,
                      `look at the ${structure.name} (${structure.group}). ${structure.summary} explain what it does day to day and what typically goes wrong with it, in plain language.`,
                    )
                  }
                />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="maps" className="mt-3">
          <ScrollArea className="h-[420px] pr-2">
            <div className="space-y-5">
              {totalMapMatches === 0 && (
                <p className="py-6 text-center text-[11px] font-light text-foreground/35">nothing matches that search.</p>
              )}
              {mapGroups.map((group) => (
                <RegionalList
                  key={group.kind}
                  title={group.label}
                  entries={group.entries}
                  onOpen={(e) =>
                    openTerritories(
                      e.territoryKeys,
                      `show the ${e.label} (${MAP_KIND_LABELS[e.kind]}). ${e.description} this follows the convention: ${e.source}.`,
                    )
                  }
                />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="development" className="mt-3">
          <ScrollArea className="h-[420px] pr-2">
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">embryology — where structures come from</p>
                <div className="space-y-1.5">
                  {EMBRYOLOGY.filter((e) => e.structureGroup.toLowerCase().includes(query.toLowerCase()) || query === "").map((e) => (
                    <button
                      key={e.id}
                      onClick={() => openTerritories(e.territoryKeys, `explain the embryological origin of the ${e.structureGroup}: ${e.event}. ${e.detail}`)}
                      className="w-full space-y-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 text-left transition hover:border-white/[0.12] hover:bg-white/[0.05]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-light text-foreground/80">{e.structureGroup}</p>
                        <Badge variant="outline" className="h-4 shrink-0 border-white/10 px-1.5 text-[9px] font-light text-foreground/40">
                          {e.germLayer}
                        </Badge>
                      </div>
                      <p className="text-[10px] font-light text-foreground/45">{e.event}</p>
                      <p className="text-[10px] font-light leading-relaxed text-foreground/45">{e.detail}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">developmental variants</p>
                <div className="space-y-1.5">
                  {DEVELOPMENTAL_VARIANTS.filter((v) => v.name.toLowerCase().includes(query.toLowerCase())).map((v) => (
                    <button
                      key={v.id}
                      onClick={() => openTerritories(v.territoryKeys, `explain the developmental variant "${v.name}": ${v.detail}`)}
                      className="w-full space-y-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 text-left transition hover:border-white/[0.12] hover:bg-white/[0.05]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-light text-foreground/80">{v.name}</p>
                        <Badge variant="outline" className="h-4 shrink-0 border-white/10 px-1.5 text-[9px] font-light text-foreground/40">
                          {v.commonality}
                        </Badge>
                      </div>
                      <p className="text-[10px] font-light leading-relaxed text-foreground/45">{v.detail}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="microbiome" className="mt-3">
          <ScrollArea className="h-[420px] pr-2">
            <div className="space-y-3">
              <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-[10px] font-light leading-relaxed text-foreground/45">
                {MICROBIOME_LIMITS}
              </p>
              {notes.length > 0 && (
                <div className="space-y-1.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-2.5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-amber-200/60">from your own entries</p>
                  {notes.map((n, i) => (
                    <p key={i} className="text-[10px] font-light leading-relaxed text-amber-200/70">
                      {n.site}: {n.note} <span className="text-amber-200/40">({n.source})</span>
                    </p>
                  ))}
                </div>
              )}
              <div className="space-y-1.5">
                {MICROBIOME_SITES.filter((s) => s.label.toLowerCase().includes(query.toLowerCase())).map((s) => (
                  <button
                    key={s.id}
                    onClick={() =>
                      openTerritories(s.territoryKeys, `explain the microbiome of the ${s.label}: ${s.detail} it influences ${s.influences.join(", ")}.`)
                    }
                    className="w-full space-y-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 text-left transition hover:border-white/[0.12] hover:bg-white/[0.05]"
                  >
                    <p className="text-[11px] font-light text-foreground/80">{s.label}</p>
                    <p className="text-[10px] font-light leading-relaxed text-foreground/45">{s.detail}</p>
                    <p className="text-[10px] font-light leading-relaxed text-foreground/35">influences: {s.influences.join(", ")}</p>
                  </button>
                ))}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="phase" className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">life phase</p>
            <select
              value={lifePhaseId ?? ""}
              onChange={(e) => setLifePhase(e.target.value || null)}
              className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-foreground/80"
            >
              <option value="">
                {`choose a phase — currently ${shownPhase.label}`}
              </option>
              {LIFE_PHASES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.ageRange}
                </option>
              ))}
            </select>
          </div>
          <ScrollArea className="h-[380px] pr-2">
            <div className="space-y-1.5">
              <p className="text-[11px] font-light text-foreground/70">{shownPhase.label} · {shownPhase.ageRange}</p>
              {shownPhase.changes.map((c, i) => (
                <button
                  key={i}
                  onClick={() =>
                    openTerritories(
                      c.territoryKeys,
                      `for the ${shownPhase.label} life phase, explain this expected ${c.system} change: ${c.detail} how does this compare with what's actually in my record?`,
                    )
                  }
                  className="w-full space-y-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5 text-left transition hover:border-white/[0.12] hover:bg-white/[0.05]"
                >
                  <Badge variant="outline" className="h-4 border-white/10 px-1.5 text-[9px] font-light text-foreground/40">
                    {c.system}
                  </Badge>
                  <p className="text-[10px] font-light leading-relaxed text-foreground/50">{c.detail}</p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

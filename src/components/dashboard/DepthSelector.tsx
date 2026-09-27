export type ResponseDepth = "shallow" | "standard" | "deep" | "expert";

interface DepthSelectorProps {
  active: ResponseDepth;
  onChange: (depth: ResponseDepth) => void;
}

const depths: { id: ResponseDepth; label: string; desc: string }[] = [
  { id: "shallow", label: "Shallow", desc: "2-3 sentences, answer only" },
  { id: "standard", label: "Standard", desc: "Balanced depth" },
  { id: "deep", label: "Deep", desc: "Full breakdown with sources" },
  { id: "expert", label: "Expert", desc: "Maximum density, no hand-holding" },
];

const DepthSelector = ({ active, onChange }: DepthSelectorProps) => (
  <div className="flex items-center gap-0.5 rounded-lg border border-border/20 bg-card/20 backdrop-blur-sm p-0.5">
    {depths.map((d) => (
      <button
        key={d.id}
        onClick={() => onChange(d.id)}
        title={d.desc}
        className={`px-2 py-1 text-[10px] font-light rounded-md transition-all ${
          active === d.id
            ? "bg-foreground/10 text-foreground"
            : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/5"
        }`}
      >
        {d.label}
      </button>
    ))}
  </div>
);

export default DepthSelector;

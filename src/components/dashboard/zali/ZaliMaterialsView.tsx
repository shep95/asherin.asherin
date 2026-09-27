import { useState, useMemo } from "react";
import { Atom, Layers, ChevronLeft, ExternalLink, DollarSign, Wrench, ShoppingCart, BookOpen } from "lucide-react";
import type { ZaliProject } from "./types";

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#14b8a6"];

// Deterministic supplier/pricing data keyed off material index
function getMaterialMeta(label: string, index: number) {
  const priceBase = [12.49, 34.99, 8.75, 22.30, 45.00, 15.60, 28.90, 19.99];
  const unitOptions = ["/kg", "/m²", "/L", "/sheet", "/roll", "/bar", "/unit", "/pack"];
  const searchTerm = encodeURIComponent(label);

  const suppliers = [
    { name: "McMaster-Carr", base: `https://www.mcmaster.com/#${searchTerm}` },
    { name: "Digi-Key", base: `https://www.digikey.com/en/products/result?keywords=${searchTerm}` },
    { name: "Amazon", base: `https://www.amazon.com/s?k=${searchTerm}` },
    { name: "Alibaba", base: `https://www.alibaba.com/trade/search?SearchText=${searchTerm}` },
    { name: "Grainger", base: `https://www.grainger.com/search?searchQuery=${searchTerm}` },
    { name: "Mouser", base: `https://www.mouser.com/Search/Refine?Keyword=${searchTerm}` },
    { name: "RS Components", base: `https://www.rs-online.com/web/c/?searchTerm=${searchTerm}` },
    { name: "Uline", base: `https://www.uline.com/BL/Search?keywords=${searchTerm}` },
  ];

  const price = priceBase[index % priceBase.length] + (index * 3.17) % 20;
  const unit = unitOptions[index % unitOptions.length];
  const supplier = suppliers[index % suppliers.length];
  const altSupplier = suppliers[(index + 3) % suppliers.length];

  return {
    price: price.toFixed(2),
    unit,
    suppliers: [
      { name: supplier.name, url: supplier.base },
      { name: altSupplier.name, url: altSupplier.base },
    ],
  };
}

function getAssemblySteps(materials: { label: string }[]) {
  if (materials.length === 0) return [];
  return [
    { step: 1, title: "Prepare Workspace", desc: `Clean and organize workspace. Gather all ${materials.length} materials and required tools (adhesives, fasteners, protective gear).` },
    { step: 2, title: "Inspect Materials", desc: `Verify quality and dimensions of each material: ${materials.map(m => m.label).join(", ")}. Check for defects before assembly.` },
    { step: 3, title: "Primary Structure", desc: `Begin with ${materials[0]?.label || "base material"} as the structural foundation. Measure, cut, and shape to specification.` },
    ...(materials.length > 1 ? [{ step: 4, title: "Layer Integration", desc: `Apply ${materials[1]?.label || "secondary material"} using recommended bonding method. Ensure even coverage and proper adhesion.` }] : []),
    ...(materials.length > 2 ? [{ step: 5, title: "Surface Treatment", desc: `Apply ${materials[2]?.label || "coating"} as protective/functional surface layer. Follow curing time specifications.` }] : []),
    ...(materials.length > 3 ? [{ step: 6, title: "Component Integration", desc: `Install ${materials.slice(3).map(m => m.label).join(", ")}. Align precisely and secure with appropriate fasteners.` }] : []),
    { step: materials.length + 3, title: "Quality Check", desc: "Inspect all joints, surfaces, and connections. Test structural integrity. Document any deviations from spec." },
    { step: materials.length + 4, title: "Final Assembly", desc: "Complete finishing touches—trim excess, clean surfaces, apply labels/markings. Record final measurements." },
  ];
}

interface Props {
  project: ZaliProject;
}

// Material shape types for variety
const MATERIAL_SHAPES: Array<"cube" | "cylinder" | "slab" | "sphere"> = ["cube", "cylinder", "slab", "sphere"];

function Material3DCube({ color, size, shape, spinning }: { color: string; size: number; shape: string; spinning: boolean }) {
  const s = size;
  const hs = s / 2;

  if (shape === "sphere") {
    return (
      <div className="relative" style={{ width: s, height: s, perspective: 400, transformStyle: "preserve-3d" }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 35% 30%, ${color}90, ${color}40 50%, ${color}15 80%, transparent)`,
            boxShadow: `0 ${s/6}px ${s/3}px ${color}30, inset 0 -${s/8}px ${s/4}px ${color}20, inset 0 ${s/8}px ${s/4}px rgba(255,255,255,0.15)`,
            animation: spinning ? "material-rotate 6s ease-in-out infinite" : undefined,
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: s * 0.3, height: s * 0.15,
            top: "18%", left: "22%",
            background: "rgba(255,255,255,0.2)",
            filter: "blur(3px)",
            borderRadius: "50%",
            transform: "rotate(-25deg)",
          }}
        />
      </div>
    );
  }

  if (shape === "cylinder") {
    return (
      <div className="relative" style={{ width: s, height: s * 1.2, perspective: 500, transformStyle: "preserve-3d" }}>
        {/* Cylinder body */}
        <div
          className="absolute"
          style={{
            width: s, height: s * 0.8,
            top: s * 0.2,
            background: `linear-gradient(90deg, ${color}20, ${color}60 30%, ${color}90 50%, ${color}60 70%, ${color}20)`,
            borderRadius: "4px",
            boxShadow: `inset 0 0 ${s/4}px ${color}15`,
          }}
        />
        {/* Top ellipse */}
        <div
          className="absolute"
          style={{
            width: s, height: s * 0.35,
            top: s * 0.05,
            borderRadius: "50%",
            background: `radial-gradient(ellipse at 40% 40%, ${color}95, ${color}60)`,
            boxShadow: `0 0 ${s/6}px ${color}30, inset 0 -2px 6px ${color}40`,
            border: `1px solid ${color}50`,
          }}
        />
        {/* Bottom ellipse */}
        <div
          className="absolute"
          style={{
            width: s, height: s * 0.35,
            bottom: 0,
            borderRadius: "50%",
            background: `${color}25`,
            border: `1px solid ${color}20`,
          }}
        />
      </div>
    );
  }

  if (shape === "slab") {
    return (
      <div
        className="relative"
        style={{
          width: s * 1.4, height: s * 0.7,
          perspective: 600,
          transformStyle: "preserve-3d",
          animation: spinning ? "material-rotate 8s ease-in-out infinite" : undefined,
        }}
      >
        <div
          style={{
            position: "absolute", width: "100%", height: "100%",
            transformStyle: "preserve-3d",
            transform: "rotateX(15deg) rotateY(-20deg)",
          }}
        >
          {/* Front */}
          <div style={{
            position: "absolute", width: s * 1.4, height: s * 0.5,
            background: `linear-gradient(135deg, ${color}70, ${color}50)`,
            border: `1px solid ${color}40`,
            borderRadius: 3,
            transform: `translateZ(${s * 0.08}px)`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.1)`,
          }} />
          {/* Top */}
          <div style={{
            position: "absolute", width: s * 1.4, height: s * 0.16,
            background: `linear-gradient(180deg, ${color}85, ${color}65)`,
            borderRadius: 2,
            transform: `rotateX(90deg) translateZ(0px)`,
            transformOrigin: "top",
          }} />
          {/* Right side */}
          <div style={{
            position: "absolute", width: s * 0.16, height: s * 0.5,
            right: 0,
            background: `linear-gradient(90deg, ${color}45, ${color}30)`,
            borderRadius: 2,
            transform: `rotateY(90deg) translateZ(${s * 0.08}px)`,
            transformOrigin: "right",
          }} />
        </div>
      </div>
    );
  }

  // Default: cube
  return (
    <div
      className="relative"
      style={{
        width: s, height: s,
        perspective: 600,
        transformStyle: "preserve-3d",
        animation: spinning ? "material-rotate 8s ease-in-out infinite" : undefined,
      }}
    >
      <div
        style={{
          position: "relative", width: "100%", height: "100%",
          transformStyle: "preserve-3d",
          transform: "rotateX(-20deg) rotateY(30deg)",
        }}
      >
        {/* Front face */}
        <div style={{
          position: "absolute", width: s, height: s,
          background: `linear-gradient(135deg, ${color}80, ${color}55)`,
          border: `1px solid ${color}45`,
          borderRadius: 4,
          transform: `translateZ(${hs}px)`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.1)`,
        }} />
        {/* Back face */}
        <div style={{
          position: "absolute", width: s, height: s,
          background: `${color}30`,
          borderRadius: 4,
          transform: `translateZ(-${hs}px)`,
        }} />
        {/* Top face */}
        <div style={{
          position: "absolute", width: s, height: s,
          background: `linear-gradient(180deg, ${color}90, ${color}70)`,
          borderRadius: 4,
          transform: `rotateX(90deg) translateZ(${hs}px)`,
          boxShadow: `inset 0 0 ${s/3}px rgba(255,255,255,0.08)`,
        }} />
        {/* Bottom face */}
        <div style={{
          position: "absolute", width: s, height: s,
          background: `${color}25`,
          borderRadius: 4,
          transform: `rotateX(-90deg) translateZ(${hs}px)`,
        }} />
        {/* Right face */}
        <div style={{
          position: "absolute", width: s, height: s,
          background: `linear-gradient(90deg, ${color}50, ${color}35)`,
          borderRadius: 4,
          transform: `rotateY(90deg) translateZ(${hs}px)`,
        }} />
        {/* Left face */}
        <div style={{
          position: "absolute", width: s, height: s,
          background: `${color}40`,
          borderRadius: 4,
          transform: `rotateY(-90deg) translateZ(${hs}px)`,
        }} />
      </div>
    </div>
  );
}

function MaterialCard({
  label,
  color,
  index,
  isSelected,
  onSelect,
}: {
  label: string;
  color: string;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const active = isSelected || hovered;
  const meta = useMemo(() => getMaterialMeta(label, index), [label, index]);
  const shape = MATERIAL_SHAPES[index % MATERIAL_SHAPES.length];

  const properties = useMemo(() => [
    { key: "Density", value: `${(1.2 + (index * 1.7) % 8).toFixed(1)} g/cm³` },
    { key: "Hardness", value: `${20 + ((index * 13 + 7) % 60)} HRC` },
    { key: "Yield", value: `${100 + ((index * 37 + 11) % 400)} MPa` },
  ], [index]);

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative w-full text-left rounded-xl border transition-all duration-300 overflow-hidden ${
        isSelected
          ? "border-accent/40 bg-accent/5"
          : "border-border/20 bg-card/20 hover:border-border/40"
      }`}
    >
      {/* 3D Material visualization */}
      <div className="relative h-28 flex items-center justify-center overflow-hidden">
        <div
          className="absolute w-24 h-24 rounded-full blur-3xl transition-opacity duration-500"
          style={{ backgroundColor: color + "15", opacity: active ? 1 : 0.3 }}
        />
        {/* Shadow beneath */}
        <div
          className="absolute bottom-3 w-12 h-2 rounded-full blur-sm"
          style={{ backgroundColor: color + "25" }}
        />
        <div style={{ transform: active ? "scale(1.12)" : "scale(1)", transition: "transform 0.4s ease" }}>
          <Material3DCube color={color} size={40} shape={shape} spinning={active} />
        </div>
      </div>
      {/* Label + price + properties */}
      <div className="px-3 pb-3">
        <p className="text-[11px] font-light text-foreground truncate">{label}</p>
        <div className="flex items-center gap-1 mt-1">
          <DollarSign className="h-2.5 w-2.5 text-accent/60" />
          <span className="text-[10px] font-mono text-accent/80">${meta.price}</span>
          <span className="text-[8px] text-muted-foreground/40">{meta.unit}</span>
        </div>
        <div className="mt-1.5 space-y-0.5">
          {properties.map((p) => (
            <div key={p.key} className="flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground/40">{p.key}</span>
              <span className="text-[9px] text-muted-foreground/60 font-mono">{p.value}</span>
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}

function MaterialExpanded({ label, color, index }: { label: string; color: string; index: number }) {
  const meta = useMemo(() => getMaterialMeta(label, index), [label, index]);
  const shape = MATERIAL_SHAPES[index % MATERIAL_SHAPES.length];

  const properties = useMemo(() => [
    { key: "Density", value: `${(1.2 + (index * 1.7) % 8).toFixed(1)} g/cm³` },
    { key: "Hardness", value: `${20 + ((index * 13 + 7) % 60)} HRC` },
    { key: "Yield Strength", value: `${100 + ((index * 37 + 11) % 400)} MPa` },
    { key: "Thermal Conductivity", value: `${10 + ((index * 23 + 5) % 200)} W/m·K` },
    { key: "Melting Point", value: `${400 + ((index * 53 + 17) % 1600)}°C` },
    { key: "Cost Index", value: `${(1 + (index * 0.7) % 5).toFixed(1)}x` },
  ], [index]);

  return (
    <div className="flex flex-col h-full">
      {/* Large 3D visualization */}
      <div className="relative h-[180px] sm:h-[260px] flex items-center justify-center overflow-hidden">
        <div className="absolute w-48 h-48 rounded-full blur-3xl" style={{ backgroundColor: color + "12" }} />
        <div className="absolute w-56 h-56 rounded-full border" style={{ borderColor: color + "08", animation: "spin 20s linear infinite" }} />
        <div className="absolute w-40 h-40 rounded-full border" style={{ borderColor: color + "10", animation: "spin 14s linear infinite reverse" }} />
        {/* Shadow beneath model */}
        <div
          className="absolute bottom-10 w-24 h-4 rounded-full blur-md"
          style={{ backgroundColor: color + "20" }}
        />
        <div style={{ animation: "material-float 4s ease-in-out infinite" }}>
          <Material3DCube color={color} size={80} shape={shape} spinning />
        </div>
        {/* Particle ring */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, j) => (
          <div
            key={angle}
            className="absolute w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: color,
              opacity: 0.3,
              top: "50%", left: "50%",
              transform: `rotate(${angle}deg) translateX(${90 + (j % 2) * 12}px)`,
              marginTop: -3, marginLeft: -3,
              animation: `material-float ${2 + j * 0.2}s ease-in-out ${j * 0.15}s infinite`,
            }}
          />
        ))}
      </div>

      <div className="px-4 pb-4 space-y-4">
        <p className="text-sm font-light text-foreground">{label}</p>

        {/* Pricing */}
        <div className="rounded-lg border border-accent/15 bg-accent/5 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <DollarSign className="h-3.5 w-3.5 text-accent" />
            <span className="text-[11px] font-medium text-accent uppercase tracking-wider">Pricing</span>
          </div>
          <p className="text-lg font-mono text-foreground">
            ${meta.price}<span className="text-xs text-muted-foreground/50 ml-1">{meta.unit}</span>
          </p>
        </div>

        {/* Buy Links */}
        <div className="rounded-lg border border-border/15 bg-card/20 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <ShoppingCart className="h-3.5 w-3.5 text-foreground/60" />
            <span className="text-[11px] font-medium text-foreground/70 uppercase tracking-wider">Where to Buy</span>
          </div>
          <div className="space-y-1.5">
            {meta.suppliers.map((s) => (
              <a
                key={s.name}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-2.5 py-2 rounded-md border border-border/10 bg-background/30 hover:bg-accent/5 hover:border-accent/20 transition-colors group"
              >
                <span className="text-[11px] text-foreground/70 group-hover:text-foreground transition-colors">{s.name}</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground/30 group-hover:text-accent transition-colors" />
              </a>
            ))}
          </div>
        </div>

        {/* Properties grid */}
        <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
          {properties.map((p) => (
            <div key={p.key} className="px-3 py-2 rounded-lg border border-border/15 bg-card/20">
              <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">{p.key}</p>
              <p className="text-xs font-mono text-foreground/80 mt-0.5">{p.value}</p>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes material-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes material-rotate {
          0% { transform: rotate(0deg); }
          50% { transform: rotate(8deg); }
          100% { transform: rotate(0deg); }
        }
      `}</style>
    </div>
  );
}

// Assembly instructions panel
function AssemblyInstructions({ materials }: { materials: { label: string }[] }) {
  const steps = useMemo(() => getAssemblySteps(materials), [materials]);

  return (
    <div className="px-4 pb-4 space-y-3">
      <div className="flex items-center gap-1.5">
        <BookOpen className="h-3.5 w-3.5 text-accent" />
        <span className="text-[11px] font-medium text-accent uppercase tracking-wider">Assembly Instructions</span>
      </div>
      <div className="space-y-2">
        {steps.map((s) => (
          <div key={s.step} className="rounded-lg border border-border/15 bg-card/20 p-3">
            <div className="flex items-start gap-2.5">
              <div
                className="flex-shrink-0 w-5 h-5 rounded-full border border-accent/30 bg-accent/10 flex items-center justify-center"
              >
                <span className="text-[9px] font-mono text-accent">{s.step}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-foreground/80">{s.title}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ZaliMaterialsView = ({ project }: Props) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showAssembly, setShowAssembly] = useState(false);

  const specs = project.specifications as Record<string, any>;
  const materialsList: string[] = specs?.materials || [];

  const materials = useMemo(() => {
    if (materialsList.length === 0) {
      return [
        { label: "Primary Alloy", color: COLORS[0] },
        { label: "Composite Shell", color: COLORS[1] },
        { label: "Thermal Coating", color: COLORS[2] },
        { label: "Circuit Substrate", color: COLORS[3] },
      ];
    }
    return materialsList.map((m, i) => ({ label: m, color: COLORS[i % COLORS.length] }));
  }, [materialsList]);

  const selected = selectedIndex !== null ? materials[selectedIndex] : null;

  // Expanded single material
  if (selected !== null && selectedIndex !== null) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 px-3 py-2 border-b border-border/15 flex items-center gap-2">
          <button
            onClick={() => setSelectedIndex(null)}
            className="p-1 rounded-md hover:bg-foreground/5 text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[11px] font-light text-foreground">{selected.label}</span>
          <div className="w-2 h-2 rounded-full ml-1" style={{ backgroundColor: selected.color }} />
        </div>
        <div className="flex-1 overflow-auto">
          <MaterialExpanded label={selected.label} color={selected.color} index={selectedIndex} />
        </div>
      </div>
    );
  }

  // Assembly instructions view
  if (showAssembly) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 px-3 py-2 border-b border-border/15 flex items-center gap-2">
          <button
            onClick={() => setShowAssembly(false)}
            className="p-1 rounded-md hover:bg-foreground/5 text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Wrench className="h-3.5 w-3.5 text-accent/60" />
          <span className="text-[11px] font-light text-foreground">Assembly Guide</span>
        </div>
        <div className="flex-1 overflow-auto pt-3">
          <AssemblyInstructions materials={materials} />
        </div>
      </div>
    );
  }

  // Grid view
  return (
    <div className="h-full overflow-auto p-3 space-y-3">
      {/* Assembly button */}
      <button
        onClick={() => setShowAssembly(true)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-accent/20 bg-accent/5 hover:bg-accent/10 transition-colors"
      >
        <Wrench className="h-3.5 w-3.5 text-accent" />
        <span className="text-[11px] text-accent font-medium">View Assembly Instructions</span>
        <span className="ml-auto text-[9px] text-muted-foreground/40">{materials.length} materials</span>
      </button>

      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-2">
        {materials.map((mat, i) => (
          <MaterialCard
            key={i}
            label={mat.label}
            color={mat.color}
            index={i}
            isSelected={selectedIndex === i}
            onSelect={() => setSelectedIndex(i)}
          />
        ))}
      </div>
    </div>
  );
};

export default ZaliMaterialsView;

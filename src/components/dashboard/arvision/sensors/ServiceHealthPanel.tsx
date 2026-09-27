// asherin.arvision — backend and edge service health.

import { RefreshCw } from "lucide-react";
import type { ServiceHealth } from "@/lib/arvision/sensors/types";

const ServiceHealthPanel = ({ services, onRefresh }: { services: ServiceHealth[]; onRefresh: () => void }) => (
  <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
    <header className="mb-3 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-[13px] font-light text-white/85">service health</h2>
        <p className="text-[11px] font-light text-white/40">
          not configured, configured but silent, and online are three different states
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] font-light text-white/70 transition hover:border-white/30 hover:text-white"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        recheck
      </button>
    </header>
    <ul className="space-y-1.5">
      {services.map((s) => (
        <li key={s.id} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-[12px] font-light">
            <span className="text-white/80">{s.label}</span>
            <span className={s.online ? "text-emerald-200/85" : s.configured ? "text-amber-100/80" : "text-white/40"}>
              {s.online ? "online" : s.configured ? "no answer" : "not configured"}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] font-light leading-relaxed text-white/45">{s.detail}</p>
          <p className="mt-0.5 text-[10px] font-light text-white/30">{s.endpointKind}</p>
        </li>
      ))}
      {services.length === 0 && <li className="text-[12px] font-light text-white/45">checking services</li>}
    </ul>
  </section>
);

export default ServiceHealthPanel;

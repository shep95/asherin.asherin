// eagle.eye — site, zones and authorized devices.

import { useMemo, useState } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import {
  AUTHORIZATION_STATEMENT,
  acknowledgeAuthorization,
  addZone,
  authorizeDevice,
  loadSite,
  removeZone,
  revokeDevice,
  saveSite,
} from "@/lib/arvision/sensors/site";
import type { SensorDescriptor, SiteConfig, SiteZone } from "@/lib/arvision/sensors/types";

const ZONE_KINDS: SiteZone["kind"][] = ["restricted", "public", "perimeter", "storage", "entry"];

const SiteAuthorizationPanel = ({ sensors }: { sensors: SensorDescriptor[] }) => {
  const [site, setSite] = useState<SiteConfig>(() => loadSite());
  const [zoneName, setZoneName] = useState("");
  const [zoneKind, setZoneKind] = useState<SiteZone["kind"]>("restricted");
  const [pickSensor, setPickSensor] = useState("");
  const [pickZone, setPickZone] = useState("");
  const [basis, setBasis] = useState<"owned" | "operated_under_contract" | "written_authorization">("owned");
  const [attestor, setAttestor] = useState("");

  const connectable = useMemo(() => sensors.filter((s) => s.modality !== "imu" && s.modality !== "gnss"), [sensors]);

  const patch = (next: SiteConfig) => setSite({ ...next });

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <header className="mb-3">
        <h2 className="text-[13px] font-light text-white/85">site and authorized devices</h2>
        <p className="text-[11px] font-light leading-relaxed text-white/40">{AUTHORIZATION_STATEMENT}</p>
      </header>

      {!site.acknowledgedAuthorizationAtMs ? (
        <button
          type="button"
          onClick={() => patch(acknowledgeAuthorization(site))}
          className="mb-3 flex items-center gap-2 rounded-xl border border-white/20 bg-white/[0.06] px-3 py-2 text-[12px] font-light text-white/85 transition hover:border-white/35"
        >
          <ShieldCheck className="h-4 w-4" />
          i confirm this company owns or is authorized to operate every device i connect
        </button>
      ) : (
        <p className="mb-3 text-[11px] font-light text-emerald-200/70">
          authorization acknowledged {new Date(site.acknowledgedAuthorizationAtMs).toLocaleString()}
        </p>
      )}

      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <input
          value={site.companyName}
          onChange={(e) => patch(saveSite({ ...site, companyName: e.target.value }))}
          placeholder="company"
          className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-[12px] font-light text-white outline-none placeholder:text-white/30 focus:border-white/30"
        />
        <input
          value={site.siteName}
          onChange={(e) => patch(saveSite({ ...site, siteName: e.target.value }))}
          placeholder="site or building"
          className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-[12px] font-light text-white outline-none placeholder:text-white/30 focus:border-white/30"
        />
      </div>

      <div className="mb-3">
        <p className="mb-1.5 text-[11px] font-light text-white/40">zones</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={zoneName}
            onChange={(e) => setZoneName(e.target.value)}
            placeholder="zone name"
            className="min-w-0 flex-1 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-[12px] font-light text-white outline-none placeholder:text-white/30 focus:border-white/30"
          />
          <select
            value={zoneKind}
            onChange={(e) => setZoneKind(e.target.value as SiteZone["kind"])}
            className="rounded-xl border border-white/12 bg-black/60 px-3 py-2 text-[12px] font-light text-white outline-none"
          >
            {ZONE_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!zoneName.trim()}
            onClick={() => {
              patch(addZone(site, { name: zoneName.trim(), kind: zoneKind, note: "" }));
              setZoneName("");
            }}
            className="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-[12px] font-light text-white/80 transition hover:border-white/30 disabled:opacity-40"
          >
            add zone
          </button>
        </div>
        <ul className="mt-2 space-y-1">
          {site.zones.map((z) => (
            <li key={z.id} className="flex items-center justify-between rounded-xl border border-white/8 bg-black/30 px-3 py-1.5 text-[11px] font-light text-white/70">
              <span>{z.name} · {z.kind}</span>
              <button type="button" onClick={() => patch(removeZone(site, z.id))} className="text-white/40 hover:text-white">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {site.zones.length === 0 && <li className="text-[11px] font-light text-white/35">no zone defined</li>}
        </ul>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-light text-white/40">authorize a connected device</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={pickSensor}
            onChange={(e) => setPickSensor(e.target.value)}
            className="rounded-xl border border-white/12 bg-black/60 px-3 py-2 text-[12px] font-light text-white outline-none"
          >
            <option value="">choose a discovered stream</option>
            {connectable.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <select
            value={pickZone}
            onChange={(e) => setPickZone(e.target.value)}
            className="rounded-xl border border-white/12 bg-black/60 px-3 py-2 text-[12px] font-light text-white outline-none"
          >
            <option value="">no zone</option>
            {site.zones.map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </select>
          <select
            value={basis}
            onChange={(e) => setBasis(e.target.value as typeof basis)}
            className="rounded-xl border border-white/12 bg-black/60 px-3 py-2 text-[12px] font-light text-white outline-none"
          >
            <option value="owned">owned by this company</option>
            <option value="operated_under_contract">operated under a service contract</option>
            <option value="written_authorization">written authorization from the owner</option>
          </select>
          <input
            value={attestor}
            onChange={(e) => setAttestor(e.target.value)}
            placeholder="who attests this"
            className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-[12px] font-light text-white outline-none placeholder:text-white/30 focus:border-white/30"
          />
        </div>
        <button
          type="button"
          disabled={!pickSensor || !attestor.trim() || !site.acknowledgedAuthorizationAtMs}
          onClick={() => {
            const s = sensors.find((x) => x.id === pickSensor);
            if (!s) return;
            patch(
              authorizeDevice(site, {
                name: s.label,
                transport: s.transport,
                modality: s.modality,
                zoneId: pickZone || null,
                authorization: { attestedBy: attestor.trim(), attestedAtMs: Date.now(), basis },
                sourceRef: s.id,
              }),
            );
            setPickSensor("");
            setAttestor("");
          }}
          className="mt-2 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-[12px] font-light text-white/80 transition hover:border-white/30 disabled:opacity-40"
        >
          authorize device
        </button>

        <ul className="mt-2 space-y-1">
          {site.devices.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/8 bg-black/30 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-light text-white/75">{d.name}</p>
                <p className="text-[10px] font-light text-white/40">
                  {d.modality} · {site.zones.find((z) => z.id === d.zoneId)?.name ?? "no zone"} ·{" "}
                  {d.authorization ? `${d.authorization.basis.replace(/_/g, " ")}, attested by ${d.authorization.attestedBy}` : "no authorization recorded"}
                </p>
              </div>
              <button type="button" onClick={() => patch(revokeDevice(site, d.id))} className="text-white/40 hover:text-white">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {site.devices.length === 0 && <li className="text-[11px] font-light text-white/35">no device authorized</li>}
        </ul>
      </div>
    </section>
  );
};

export default SiteAuthorizationPanel;

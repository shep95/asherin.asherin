// asherin.arvision — the see-through layer.
// Peers in clear line of sight are drawn as a solid marker. Peers whose line of
// sight leaves the walkable corridor are drawn as a skeleton silhouette, which is
// exactly the behaviour the uploaded package uses for occluded players. The
// corridor test is a proxy for scanned wall geometry and the badge says so.

import type { CameraIntrinsics } from "@/lib/arvision/spatial/intrinsics";
import type { NavigationGraph } from "@/lib/arvision/spatial/navData";
import { evaluateOcclusion, projectPoint, rangeTo } from "@/lib/arvision/spatial/projection";
import type { PeerState, Quat, Vec3 } from "@/lib/arvision/spatial/types";

interface ArOverlayProps {
  graph: NavigationGraph | null;
  viewerPosition: Vec3 | null;
  viewerRotation: Quat | null;
  intrinsics: CameraIntrinsics;
  peers: PeerState[];
  showSilhouettes: boolean;
}

const Skeleton = ({ color }: { color: string }) => (
  <svg viewBox="0 0 40 96" className="h-full w-full" aria-hidden="true">
    <g stroke={color} strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.9">
      <circle cx="20" cy="12" r="7" />
      <path d="M20 19 V54" />
      <path d="M20 26 L6 38 M20 26 L34 38" />
      <path d="M20 54 L9 88 M20 54 L31 88" />
    </g>
  </svg>
);

const ArOverlay = ({ graph, viewerPosition, viewerRotation, intrinsics, peers, showSilhouettes }: ArOverlayProps) => {
  if (!viewerPosition || !viewerRotation) return null;

  const markers = peers
    .filter((peer) => peer.pose)
    .map((peer) => {
      const pose = peer.pose as NonNullable<PeerState["pose"]>;
      const head: Vec3 = { x: pose.position.x, y: pose.position.y + 1.6, z: pose.position.z };
      const projected = projectPoint(viewerPosition, viewerRotation, head, intrinsics);
      const occlusion = evaluateOcclusion(graph, viewerPosition, pose.position);
      const range = rangeTo(viewerPosition, pose.position);
      return { peer, pose, projected, occlusion, range };
    })
    .filter((m) => m.projected.depth > 0.2)
    .sort((a, b) => b.range - a.range);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {markers.map(({ peer, projected, occlusion, range }) => {
        const color = `rgb(${Math.round(peer.colorR * 255)},${Math.round(peer.colorG * 255)},${Math.round(peer.colorB * 255)})`;
        const height = Math.max(48, Math.min(260, (1.7 * intrinsics.fy) / Math.max(projected.depth, 0.6)));
        const occludedView = occlusion.occluded && showSilhouettes;
        const clamped = {
          left: `${Math.min(Math.max(projected.u, 0.02), 0.98) * 100}%`,
          top: `${Math.min(Math.max(projected.v, 0.04), 0.96) * 100}%`,
        };

        return (
          <div
            key={peer.peerId}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ ...clamped, width: height * 0.42, height, opacity: projected.inFrame ? 1 : 0.35 }}
          >
            {occludedView ? (
              <Skeleton color={color} />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span
                  className="rounded-full"
                  style={{
                    width: Math.max(10, height * 0.14),
                    height: Math.max(10, height * 0.14),
                    background: color,
                    boxShadow: `0 0 18px ${color}`,
                  }}
                />
              </div>
            )}
            <div className="absolute left-1/2 top-full w-max -translate-x-1/2 translate-y-1 rounded-full border border-white/12 bg-black/55 px-2 py-0.5 text-[10px] font-light text-white/85 backdrop-blur">
              {peer.playerName} · {range.toFixed(1)}m
              {occludedView ? " · behind geometry" : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ArOverlay;

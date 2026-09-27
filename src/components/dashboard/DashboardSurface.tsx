import { isLightBackground, type DashboardAppearance } from "@/lib/dashboardAppearance";

interface Props {
  appearance: DashboardAppearance;
  activeWallpaper: string;
  prevWallpaper: string | null;
  transitioning: boolean;
}

/**
 * The workspace surface: either the operator's photograph (with the readable
 * scrim it has always had) or the flat colour they chose. In colour mode the
 * 80% photo scrim is gone — keeping it would hide the colour entirely.
 */
const DashboardSurface = ({ appearance, activeWallpaper, prevWallpaper, transitioning }: Props) => {
  if (appearance.mode === "color") {
    const light = isLightBackground(appearance.color);
    return (
      <>
        <div
          data-dashboard-surface="color"
          className="fixed inset-0 pointer-events-none transition-colors duration-300"
          style={{ backgroundColor: appearance.color, zIndex: 1 }}
        />
        <div
          data-dashboard-veil
          className="fixed inset-0 pointer-events-none transition-opacity duration-300"
          style={{
            zIndex: 3,
            // A light hex needs a real scrim or asherin's pale type is
            // white-on-white; a dark hex keeps the operator's veil value.
            backgroundColor: light ? "hsl(0 0% 0% / 0.62)" : "hsl(0 0% 0% / 1)",
            opacity: light ? 1 : appearance.dim / 100,
          }}
        />
      </>
    );
  }

  return (
    <>
      {prevWallpaper && transitioning && (
        <div
          className="fixed inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
          style={{ backgroundImage: `url(${prevWallpaper})`, zIndex: 0 }}
        />
      )}
      <div
        data-dashboard-surface="wallpaper"
        className="fixed inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{
          backgroundImage: `url(${activeWallpaper})`,
          zIndex: 1,
          opacity: transitioning ? 0 : 1,
          animation: transitioning
            ? "wpFadeIn 0.8s cubic-bezier(0.16,1,0.3,1) 0.1s forwards"
            : undefined,
        }}
      />
      <div
        data-dashboard-veil
        className="fixed inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          zIndex: 3,
          backgroundColor: "hsl(0 0% 0% / 0.8)",
          opacity: transitioning ? 0.5 : 1,
        }}
      />
    </>
  );
};

export default DashboardSurface;

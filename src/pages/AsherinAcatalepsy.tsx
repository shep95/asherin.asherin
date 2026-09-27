import AcatalepsyWorkspace from "@/components/acatalepsy/AcatalepsyWorkspace";
import SiteFooter from "@/components/SiteFooter";
import { getWallpaperSrc } from "@/lib/wallpapers";

export default function AsherinAcatalepsy() {
  return <div className="relative min-h-screen bg-background"><img src={getWallpaperSrc("cosmos")} alt="" aria-hidden className="fixed inset-0 h-full w-full object-cover opacity-55" decoding="async"/><div className="fixed inset-0 bg-background/75" aria-hidden/><div className="relative z-10"><AcatalepsyWorkspace/><SiteFooter /></div></div>;
}
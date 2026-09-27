import { useState, useEffect } from "react";
import { getStoredWallpaper } from "./WallpaperSwitcher";
import WallpaperSwitcher from "./WallpaperSwitcher";

interface Props {
  children: React.ReactNode;
  overlayOpacity?: string;
}

/**
 * The public pages sit on one still image under layered black. No glow, no
 * ripple, no aurora: the wallpaper is a presence at the edge of the room, not
 * a performance in the middle of it.
 */
const LandingBackground = ({ children, overlayOpacity = "bg-black/80" }: Props) => {
  const [currentWallpaper, setCurrentWallpaper] = useState(getStoredWallpaper);

  useEffect(() => {
    const handler = () => setCurrentWallpaper(getStoredWallpaper());
    window.addEventListener("wallpaper-change", handler);
    return () => window.removeEventListener("wallpaper-change", handler);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{ backgroundImage: `url(${currentWallpaper})`, zIndex: 0 }}
      />
      <div className={`fixed inset-0 ${overlayOpacity} pointer-events-none`} style={{ zIndex: 1 }} />
      <div className="relative" style={{ zIndex: 10 }}>
        {children}
      </div>
      <WallpaperSwitcher />
    </div>
  );
};

export default LandingBackground;

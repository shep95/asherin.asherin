import { Link, useLocation } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import LandingBackground from "@/components/LandingBackground";
import { applySeoHead } from "@/lib/seoHead";
const wallpaperAureon = "/wallpapers/wallpaper-aureon.webp";

/**
 * ASHERIN 404 — "Lost in Orbit"
 * A monochrome, Aureon-themed not-found page with an offline
 * Chrome-dino-style mini game: a futuristic dino in a space suit
 * jumping rogue asteroids and broken satellites, with Saturn looming
 * in the background. Funny flavor text included.
 */

type Obstacle = { x: number; w: number; h: number; kind: "asteroid" | "satellite" | "alien" };

const GROUND_Y = 170;
const GRAVITY = 0.6;
const JUMP_V = -11.5;

const QUIPS = [
  "houston, we lost the page.",
  "this URL drifted past saturn.",
  "the page got sucked into a black hole.",
  "even asherin can't find this one.",
  "404: page achieved escape velocity.",
];

const NotFound = () => {
  const location = useLocation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("aureon_404_best") || 0);
  });
  const [running, setRunning] = useState(false);
  const [dead, setDead] = useState(false);
  const [quip] = useState(() => QUIPS[Math.floor(Math.random() * QUIPS.length)]);

  const stateRef = useRef({
    dinoY: GROUND_Y,
    vy: 0,
    obstacles: [] as Obstacle[],
    speed: 6,
    frame: 0,
    score: 0,
    running: false,
    dead: false,
    saturnRot: 0,
    stars: [] as { x: number; y: number; r: number; tw: number }[],
    soul: null as null | {
      x: number;
      y: number;
      vy: number;
      vx: number;
      life: number;
      particles: { x: number; y: number; vx: number; vy: number; r: number; life: number }[];
    },
  });

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    applySeoHead({
      title: "not found | asherin",
      description:
        "This isn't a page on asherin. Click to return, or play the offline space-dino game while you're here.",
      path: location.pathname,
    });
    // Dork-hardening: every 404 must be de-indexable so recon probes for
    // /wp-admin, /.env, /phpmyadmin etc. never leave a cache footprint.
    let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const prev = robots?.getAttribute("content") ?? null;
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute("content", "noindex, nofollow, noarchive, nosnippet, noimageindex");
    return () => {
      if (prev === null) robots?.remove();
      else robots?.setAttribute("content", prev);
    };
  }, [location.pathname]);

  const reset = useCallback(() => {
    const s = stateRef.current;
    s.dinoY = GROUND_Y;
    s.vy = 0;
    s.obstacles = [];
    s.speed = 6;
    s.frame = 0;
    s.score = 0;
    s.dead = false;
    s.running = true;
    s.soul = null;

    setScore(0);
    setDead(false);
    setRunning(true);
  }, []);

  const jump = useCallback(() => {
    const s = stateRef.current;
    if (!s.running) {
      reset();
      return;
    }
    if (s.dinoY >= GROUND_Y) {
      s.vy = JUMP_V;
    }
  }, [reset]);

  // Init stars once
  useEffect(() => {
    const s = stateRef.current;
    s.stars = Array.from({ length: 80 }, () => ({
      x: Math.random() * 800,
      y: Math.random() * 160,
      r: Math.random() * 1.4 + 0.2,
      tw: Math.random() * Math.PI * 2,
    }));
  }, []);

  // Input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const W = canvas.width;
    const H = canvas.height;

    const drawSaturn = (rot: number) => {
      ctx.save();
      ctx.translate(W - 130, 90);
      ctx.rotate(-0.35);
      // planet
      const grad = ctx.createRadialGradient(-20, -20, 10, 0, 0, 70);
      grad.addColorStop(0, "#3a3a3a");
      grad.addColorStop(1, "#0a0a0a");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 60, 0, Math.PI * 2);
      ctx.fill();
      // rings
      ctx.strokeStyle = "rgba(220,220,220,0.55)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(0, 0, 95, 18, rot * 0.001, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(160,160,160,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 110, 22, rot * 0.001, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };

    const drawStars = (frame: number) => {
      const s = stateRef.current;
      for (const st of s.stars) {
        const a = 0.4 + Math.sin(frame * 0.03 + st.tw) * 0.4;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawGround = () => {
      ctx.strokeStyle = "#888";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y + 28);
      ctx.lineTo(W, GROUND_Y + 28);
      ctx.stroke();
      // craters / dashes
      ctx.fillStyle = "#555";
      const offset = (stateRef.current.frame * stateRef.current.speed) % 40;
      for (let x = -offset; x < W; x += 40) {
        ctx.fillRect(x, GROUND_Y + 32, 14, 2);
      }
    };

    const drawDino = (y: number, frame: number) => {
      ctx.save();
      ctx.translate(70, y);
      // shadow
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.ellipse(14, 30, 20, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // body (space suit) — white/grey blocky dino
      ctx.fillStyle = "#e8e8e8";
      ctx.fillRect(0, 0, 28, 26); // body
      ctx.fillRect(20, -14, 22, 20); // head
      ctx.fillRect(38, -10, 6, 6); // snout

      // helmet visor
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(26, -10, 12, 8);
      ctx.fillStyle = "rgba(180,220,255,0.6)";
      ctx.fillRect(27, -9, 4, 3);

      // antenna
      ctx.strokeStyle = "#bbb";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(32, -14);
      ctx.lineTo(34, -22);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(34, -23, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // backpack jets
      ctx.fillStyle = "#9a9a9a";
      ctx.fillRect(-6, 2, 8, 16);
      ctx.fillStyle = "#ff7a3d";
      const flame = frame % 6 < 3 ? 6 : 4;
      ctx.fillRect(-10, 8, 4, flame);

      // legs — animate when on ground
      ctx.fillStyle = "#e8e8e8";
      const onGround = y >= GROUND_Y;
      const step = onGround && frame % 12 < 6 ? 0 : 4;
      ctx.fillRect(4, 26, 6, 8 - step);
      ctx.fillRect(16, 26, 6, 4 + step);

      // tail
      ctx.fillRect(-4, 6, 6, 10);

      ctx.restore();
    };

    const drawObstacle = (o: Obstacle) => {
      ctx.save();
      ctx.translate(o.x, GROUND_Y + 28 - o.h);
      if (o.kind === "asteroid") {
        ctx.fillStyle = "#6b6b6b";
        ctx.beginPath();
        ctx.arc(o.w / 2, o.h / 2, o.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3a3a3a";
        ctx.beginPath();
        ctx.arc(o.w / 2 - 4, o.h / 2 - 3, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(o.w / 2 + 3, o.h / 2 + 4, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (o.kind === "satellite") {
        ctx.fillStyle = "#c8c8c8";
        ctx.fillRect(o.w / 2 - 6, 4, 12, o.h - 8);
        ctx.fillStyle = "#7aa7d9";
        ctx.fillRect(0, o.h / 2 - 4, o.w / 2 - 6, 8);
        ctx.fillRect(o.w / 2 + 6, o.h / 2 - 4, o.w / 2 - 6, 8);
        ctx.fillStyle = "#fff";
        ctx.fillRect(o.w / 2 - 2, 0, 4, 6);
      } else {
        // alien UFO — flies a bit higher
        ctx.fillStyle = "#9a9a9a";
        ctx.beginPath();
        ctx.ellipse(o.w / 2, o.h / 2, o.w / 2, o.h / 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(180,220,255,0.7)";
        ctx.beginPath();
        ctx.arc(o.w / 2, o.h / 2 - 4, o.w / 4, Math.PI, 0);
        ctx.fill();
      }
      ctx.restore();
    };

    const spawn = () => {
      const s = stateRef.current;
      const r = Math.random();
      if (r < 0.55) {
        s.obstacles.push({ x: W + 20, w: 26, h: 26, kind: "asteroid" });
      } else if (r < 0.85) {
        s.obstacles.push({ x: W + 20, w: 34, h: 36, kind: "satellite" });
      } else {
        s.obstacles.push({ x: W + 20, w: 40, h: 22, kind: "alien" });
      }
    };

    const tick = () => {
      const s = stateRef.current;
      ctx.clearRect(0, 0, W, H);

      // background
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#050507");
      bg.addColorStop(1, "#101014");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      drawStars(s.frame);
      s.saturnRot += 1;
      drawSaturn(s.saturnRot);
      drawGround();

      if (s.running && !s.dead) {
        s.frame++;
        s.score = Math.floor(s.frame / 6);
        s.speed = 6 + Math.min(8, s.frame / 600);

        // physics
        s.vy += GRAVITY;
        s.dinoY = Math.min(GROUND_Y, s.dinoY + s.vy);
        if (s.dinoY === GROUND_Y) s.vy = 0;

        // spawn
        const last = s.obstacles[s.obstacles.length - 1];
        const gap = 220 + Math.random() * 220;
        if (!last || W - last.x > gap) spawn();

        // move + cull
        for (const o of s.obstacles) o.x -= s.speed;
        s.obstacles = s.obstacles.filter((o) => o.x + o.w > -10);

        // collision (AABB on a tight dino box)
        const dinoBox = { x: 64, y: s.dinoY - 16, w: 40, h: 46 };
        for (const o of s.obstacles) {
          const oy = GROUND_Y + 28 - o.h;
          if (
            dinoBox.x < o.x + o.w - 4 &&
            dinoBox.x + dinoBox.w > o.x + 4 &&
            dinoBox.y < oy + o.h - 4 &&
            dinoBox.y + dinoBox.h > oy + 4
          ) {
            s.dead = true;
            s.running = false;
            // Spawn ascending soul from dino position
            s.soul = {
              x: 84,
              y: s.dinoY - 4,
              vy: -0.6,
              vx: 0,
              life: 0,
              particles: Array.from({ length: 14 }, () => ({
                x: 84 + (Math.random() - 0.5) * 16,
                y: s.dinoY + (Math.random() - 0.5) * 16,
                vx: (Math.random() - 0.5) * 0.6,
                vy: -Math.random() * 1.2 - 0.3,
                r: Math.random() * 1.6 + 0.4,
                life: 0,
              })),
            };
            setDead(true);
            setRunning(false);
            setScore(s.score);
            setBest((b) => {
              const nb = Math.max(b, s.score);
              localStorage.setItem("aureon_404_best", String(nb));
              return nb;
            });
            break;
          }
        }
      }

      for (const o of stateRef.current.obstacles) drawObstacle(o);
      // Hide dino once soul has risen far enough
      const soul = stateRef.current.soul;
      if (!soul || soul.life < 30) {
        drawDino(stateRef.current.dinoY, stateRef.current.frame);
      }

      // Animate & draw ascending soul
      if (soul) {
        soul.life++;
        soul.y += soul.vy;
        soul.vy -= 0.008; // gentle acceleration upward
        soul.x += Math.sin(soul.life * 0.08) * 0.4;

        // particle trail
        for (const p of soul.particles) {
          p.life++;
          p.x += p.vx;
          p.y += p.vy;
          p.vy -= 0.01;
          const a = Math.max(0, 1 - p.life / 120);
          ctx.fillStyle = `rgba(200,230,255,${a * 0.8})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }

        // ghost body — translucent dino silhouette rising
        const alpha = Math.max(0, 1 - soul.life / 220);
        ctx.save();
        ctx.globalAlpha = alpha * 0.85;
        // glow halo
        const halo = ctx.createRadialGradient(soul.x, soul.y, 2, soul.x, soul.y, 28);
        halo.addColorStop(0, "rgba(220,240,255,0.9)");
        halo.addColorStop(1, "rgba(220,240,255,0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(soul.x, soul.y, 28, 0, Math.PI * 2);
        ctx.fill();
        // little ghost
        ctx.fillStyle = "rgba(240,250,255,0.95)";
        ctx.beginPath();
        ctx.arc(soul.x, soul.y - 4, 9, Math.PI, 0);
        ctx.lineTo(soul.x + 9, soul.y + 8);
        const wob = Math.sin(soul.life * 0.4) * 2;
        ctx.lineTo(soul.x + 5, soul.y + 6 + wob);
        ctx.lineTo(soul.x, soul.y + 8 - wob);
        ctx.lineTo(soul.x - 5, soul.y + 6 + wob);
        ctx.lineTo(soul.x - 9, soul.y + 8);
        ctx.closePath();
        ctx.fill();
        // eyes
        ctx.fillStyle = "rgba(20,30,50,0.8)";
        ctx.fillRect(soul.x - 4, soul.y - 4, 2, 3);
        ctx.fillRect(soul.x + 2, soul.y - 4, 2, 3);
        ctx.restore();
      }

      // HUD
      ctx.fillStyle = "#e8e8e8";
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "right";
      ctx.fillText(
        `SCORE ${String(stateRef.current.score).padStart(5, "0")}   BEST ${String(best).padStart(5, "0")}`,
        W - 16,
        24,
      );
      ctx.textAlign = "left";

      if (!stateRef.current.running) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#fff";
        ctx.font = "600 18px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        ctx.fillText(
          stateRef.current.dead ? "MISSION FAILED, your dino bonked an asteroid." : "OFFLINE SPACE-DINO",
          W / 2,
          H / 2 - 8,
        );
        ctx.font = "12px ui-monospace, monospace";
        ctx.fillText("press SPACE / ↑ / tap to launch", W / 2, H / 2 + 14);
        ctx.textAlign = "left";
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [best]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050507] text-zinc-200">
      {/* Asherin wallpaper */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${wallpaperAureon})`, zIndex: 0 }}
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-black/70" style={{ zIndex: 1 }} />
      {/* ambient grid + glow */}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.08), transparent)" }}
      />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-16">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-[0.2em] text-zinc-400 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
          asherin · signal lost
        </div>

        <p className="text-center font-semibold tracking-tight" aria-hidden="true">
          <span className="block text-[88px] leading-none text-white sm:text-[128px]">404</span>
        </p>
        <h1 className="mt-3 text-center text-lg font-semibold tracking-tight text-zinc-300 sm:text-xl">
          not found | asherin
        </h1>
        <p className="mt-2 max-w-md text-center text-sm text-zinc-500">this isn't a page on asherin.</p>

        <p className="mt-3 max-w-md text-center text-sm text-zinc-500">
          {quip} meanwhile, our intern (a dino in a space suit) is dodging asteroids near saturn. give him a hand.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/"
            className="group inline-flex items-center gap-2 rounded-md border border-white/15 bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200"
          >
            click here to go back to asherin
            <span className="transition group-hover:translate-x-0.5">→</span>
          </a>
          <button
            onClick={jump}
            className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm text-zinc-200 transition hover:bg-white/[0.07]"
          >
            {running ? "jump" : dead ? "respawn dino" : "launch dino"}
          </button>
        </div>

        {/* Game */}
        <div
          className="mt-10 w-full max-w-3xl overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur"
          onClick={jump}
          onTouchStart={(e) => {
            e.preventDefault();
            jump();
          }}
          role="button"
          aria-label="Offline space-dino game. Tap or press space to jump."
        >
          <canvas ref={canvasRef} width={800} height={240} className="block h-auto w-full select-none" />
        </div>

        <div className="mt-4 flex items-center gap-4 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
          <span>space / ↑ to jump</span>
          <span className="h-1 w-1 rounded-full bg-zinc-700" />
          <span>tap canvas on mobile</span>
          <span className="h-1 w-1 rounded-full bg-zinc-700" />
          <span>#houseofasher</span>
        </div>
      </main>
    </div>
  );
};

export default NotFound;

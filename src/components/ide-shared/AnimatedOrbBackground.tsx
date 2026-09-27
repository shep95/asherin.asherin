// Subtle animated particle/orb backdrop for the IDE editor canvas.
// Pure canvas, no deps, respects prefers-reduced-motion. Monochrome to match
// the Asher / Asherin dark aesthetic.
import { useEffect, useRef } from "react";

interface Props {
  className?: string;
  /** 0..1 — overall opacity of the layer */
  intensity?: number;
}

export default function AnimatedOrbBackground({ className = "", intensity = 0.55 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;

    const parent = canvas.parentElement!;
    const ro = new ResizeObserver(() => resize());
    ro.observe(parent);

    function resize() {
      const r = parent.getBoundingClientRect();
      w = Math.max(1, Math.floor(r.width));
      h = Math.max(1, Math.floor(r.height));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    type Particle = { x: number; y: number; vx: number; vy: number; r: number; a: number };
    const COUNT = reduced ? 18 : 46;
    const particles: Particle[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: 0.6 + Math.random() * 1.6,
      a: 0.25 + Math.random() * 0.55,
    }));

    // Two slow drifting "orbs" that cast a soft glow gradient
    const orbs = [
      { x: w * 0.25, y: h * 0.35, r: Math.max(140, Math.min(w, h) * 0.35), hue: 0, vx: 0.06, vy: 0.04 },
      { x: w * 0.78, y: h * 0.7,  r: Math.max(160, Math.min(w, h) * 0.4),  hue: 0, vx: -0.05, vy: -0.03 },
    ];

    let t = 0;
    function frame() {
      t += 1;
      ctx.clearRect(0, 0, w, h);

      // Base radial wash
      const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      bg.addColorStop(0, `rgba(255,255,255,${0.025 * intensity})`);
      bg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Drifting glow orbs
      for (const o of orbs) {
        o.x += o.vx; o.y += o.vy;
        if (o.x < -o.r) o.x = w + o.r;
        if (o.x > w + o.r) o.x = -o.r;
        if (o.y < -o.r) o.y = h + o.r;
        if (o.y > h + o.r) o.y = -o.r;

        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        g.addColorStop(0, `rgba(255,255,255,${0.08 * intensity})`);
        g.addColorStop(0.45, `rgba(180,180,180,${0.025 * intensity})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Particles + nearest-neighbour links
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220,220,220,${p.a * intensity})`;
        ctx.fill();
      }

      // Soft constellation lines
      ctx.lineWidth = 1;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 110 * 110) {
            const alpha = (1 - d2 / (110 * 110)) * 0.18 * intensity;
            ctx.strokeStyle = `rgba(200,200,200,${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [intensity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
    />
  );
}

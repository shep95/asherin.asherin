import { useEffect, useRef, useState } from "react";

interface VoiceRecordingOrbProps {
  /** Size in px — the orb will be this diameter */
  size?: number;
  /** When true the orb pulses more aggressively */
  isActive?: boolean;
  onClick?: () => void;
  /** Optional: elapsed recording seconds to display */
  seconds?: number;
}

/**
 * Animated iridescent morphing orb used as a voice‑recording indicator.
 * Adapted from a reference animation (marble/watercolor sphere) and
 * re-themed for Aureon's dark glassmorphic aesthetic using the app's
 * purple accent palette.
 */
const VoiceRecordingOrb = ({
  size = 36,
  isActive = true,
  onClick,
  seconds,
}: VoiceRecordingOrbProps) => {
  /* tiny wobble driven by RAF for organic feel */
  const [tick, setTick] = useState(0);
  const raf = useRef<number>();

  useEffect(() => {
    if (!isActive) return;
    let t = 0;
    const loop = () => {
      t += 1;
      if (t % 3 === 0) setTick(t); // ~20 fps update
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [isActive]);

  const s = size;
  const half = s / 2;

  return (
    <button
      onClick={onClick}
      className="relative shrink-0 flex items-center justify-center group cursor-pointer"
      style={{ width: s + 8, height: s + 8 }}
      title={seconds != null ? `Recording… ${seconds}s — click to stop` : "Recording — click to stop"}
    >
      {/* Ambient glow beneath */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: s * 1.5,
          height: s * 1.5,
          background: `radial-gradient(circle, hsla(275, 80%, 55%, 0.25) 0%, transparent 70%)`,
          filter: "blur(10px)",
          animation: "voiceOrbPulse 2.5s ease-in-out infinite",
        }}
      />

      {/* SVG orb layers */}
      <svg
        width={s}
        height={s}
        viewBox={`0 0 ${s} ${s}`}
        className="relative z-10"
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Morphing clip path */}
          <clipPath id="voiceOrbClip">
            <circle cx={half} cy={half} r={half - 1}>
              <animate
                attributeName="r"
                values={`${half - 2};${half - 1};${half - 2}`}
                dur="3s"
                repeatCount="indefinite"
              />
            </circle>
          </clipPath>

          {/* Iridescent gradient — rotates */}
          <radialGradient id="voiceOrbGrad1" cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="hsl(275, 85%, 65%)" stopOpacity="0.9">
              <animate attributeName="stopColor" values="hsl(275,85%,65%);hsl(200,80%,60%);hsl(310,70%,60%);hsl(275,85%,65%)" dur="6s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor="hsl(200, 80%, 55%)" stopOpacity="0.7">
              <animate attributeName="stopColor" values="hsl(200,80%,55%);hsl(170,70%,50%);hsl(240,80%,60%);hsl(200,80%,55%)" dur="8s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="hsl(320, 60%, 50%)" stopOpacity="0.5">
              <animate attributeName="stopColor" values="hsl(320,60%,50%);hsl(275,70%,55%);hsl(180,60%,45%);hsl(320,60%,50%)" dur="7s" repeatCount="indefinite" />
            </stop>
          </radialGradient>

          {/* Second overlay gradient for depth */}
          <radialGradient id="voiceOrbGrad2" cx="65%" cy="60%" r="55%">
            <stop offset="0%" stopColor="hsl(180, 70%, 55%)" stopOpacity="0.5">
              <animate attributeName="stopColor" values="hsl(180,70%,55%);hsl(275,60%,55%);hsl(220,80%,60%);hsl(180,70%,55%)" dur="5s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          {/* Specular highlight */}
          <radialGradient id="voiceOrbSpec" cx="35%" cy="30%" r="30%">
            <stop offset="0%" stopColor="white" stopOpacity="0.4" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer morphing ring */}
        <g style={{ animation: "voiceOrbRotate 12s linear infinite" }}>
          <circle
            cx={half}
            cy={half}
            r={half - 1}
            fill="none"
            stroke="url(#voiceOrbGrad1)"
            strokeWidth="1.5"
            opacity="0.3"
            style={{ animation: "voiceOrbMorph 4s ease-in-out infinite" }}
          />
        </g>

        {/* Main orb body — clipped circle with morphing gradients */}
        <g clipPath="url(#voiceOrbClip)">
          {/* Base fill */}
          <circle
            cx={half}
            cy={half}
            r={half}
            fill="url(#voiceOrbGrad1)"
            style={{ animation: "voiceOrbRotate 10s linear infinite" }}
          />
          {/* Secondary color overlay */}
          <circle
            cx={half}
            cy={half}
            r={half}
            fill="url(#voiceOrbGrad2)"
            style={{ animation: "voiceOrbRotate 7s linear infinite reverse", mixBlendMode: "screen" }}
          />
          {/* Turbulence texture simulation — overlapping semi-transparent ellipses */}
          <ellipse
            cx={half * 0.7}
            cy={half * 0.8}
            rx={half * 0.55}
            ry={half * 0.4}
            fill="hsla(250, 70%, 60%, 0.25)"
            style={{ animation: "voiceOrbDrift1 5s ease-in-out infinite" }}
          />
          <ellipse
            cx={half * 1.3}
            cy={half * 1.1}
            rx={half * 0.4}
            ry={half * 0.5}
            fill="hsla(180, 60%, 50%, 0.2)"
            style={{ animation: "voiceOrbDrift2 6s ease-in-out infinite" }}
          />
          <ellipse
            cx={half}
            cy={half * 0.6}
            rx={half * 0.35}
            ry={half * 0.3}
            fill="hsla(310, 60%, 55%, 0.2)"
            style={{ animation: "voiceOrbDrift3 4.5s ease-in-out infinite" }}
          />
          {/* Specular highlight */}
          <circle cx={half} cy={half} r={half} fill="url(#voiceOrbSpec)" />
        </g>
      </svg>

      {/* Recording seconds overlay */}
      {seconds != null && seconds > 0 && (
        <span
          className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-mono tracking-wider text-primary/60 z-20"
          style={{ textShadow: "0 0 4px hsla(275, 80%, 50%, 0.4)" }}
        >
          {seconds}s
        </span>
      )}

      <style>{`
        @keyframes voiceOrbRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes voiceOrbPulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes voiceOrbMorph {
          0%, 100% { rx: ${half - 2}; ry: ${half - 1}; }
          50% { rx: ${half - 1}; ry: ${half - 2}; }
        }
        @keyframes voiceOrbDrift1 {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(3px, -2px) rotate(15deg); }
        }
        @keyframes voiceOrbDrift2 {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(-2px, 3px) rotate(-10deg); }
        }
        @keyframes voiceOrbDrift3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(2px, 2px) scale(1.15); }
        }
      `}</style>
    </button>
  );
};

export default VoiceRecordingOrb;

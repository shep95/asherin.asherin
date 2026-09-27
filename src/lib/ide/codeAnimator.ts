// Word-by-word blur/fade animator for code insertion in both IDEs.
// - animateInsert: types target content into setter using per-word fade-in
// - animateReplace: fades current out, then animateInserts the new
// Pure setter-driven so it works with Monaco's controlled `value` prop.

export interface WordAnimOptions {
  /** ms between word reveals while typing in */
  perWordMs?: number;
  /** ms for the fade-out phase before replacing */
  fadeOutMs?: number;
  /** if true, animation is skipped (instant set) */
  instant?: boolean;
  /** called when finished */
  onDone?: () => void;
}

const DEFAULTS: Required<Omit<WordAnimOptions, "onDone">> = {
  perWordMs: 18,
  fadeOutMs: 220,
  instant: false,
};

// Splits while preserving whitespace/newlines so reassembly is identical.
function tokenize(src: string): string[] {
  // Word, whitespace, or single non-space char fallback
  return src.match(/\S+|\s+/g) ?? [];
}

interface Handle {
  cancel: () => void;
}

/** Reveal `content` into `setValue` token-by-token. Returns a handle to cancel. */
export function animateInsert(
  content: string,
  setValue: (next: string) => void,
  opts: WordAnimOptions = {},
): Handle {
  const { perWordMs, instant, onDone } = { ...DEFAULTS, ...opts };
  if (instant || !content) {
    setValue(content);
    onDone?.();
    return { cancel: () => {} };
  }

  const tokens = tokenize(content);
  let i = 0;
  let cancelled = false;
  let timer: number | null = null;

  // Adaptive: shorter delay on big files
  const delay = tokens.length > 1200 ? 4 : tokens.length > 400 ? 8 : perWordMs;

  setValue("");
  const tick = () => {
    if (cancelled) return;
    i++;
    setValue(tokens.slice(0, i).join(""));
    if (i < tokens.length) {
      timer = window.setTimeout(tick, delay);
    } else {
      onDone?.();
    }
  };
  timer = window.setTimeout(tick, delay);

  return {
    cancel: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  };
}

/** Fade out `currentContent` to empty, then animateInsert `nextContent`. */
export function animateReplace(
  currentContent: string,
  nextContent: string,
  setValue: (next: string) => void,
  opts: WordAnimOptions = {},
): Handle {
  const merged = { ...DEFAULTS, ...opts };
  if (merged.instant) {
    setValue(nextContent);
    opts.onDone?.();
    return { cancel: () => {} };
  }

  const cur = tokenize(currentContent);
  let cancelled = false;
  let timer: number | null = null;
  let inner: Handle | null = null;

  // Drop tokens from the end → empty (faster than per-word for big files)
  const steps = Math.min(cur.length, 18);
  const stepDelay = Math.max(8, Math.floor(merged.fadeOutMs / Math.max(1, steps)));
  let s = 0;

  const fadeOut = () => {
    if (cancelled) return;
    s++;
    const remaining = Math.max(0, cur.length - Math.ceil((cur.length / steps) * s));
    setValue(cur.slice(0, remaining).join(""));
    if (s < steps) {
      timer = window.setTimeout(fadeOut, stepDelay);
    } else {
      setValue("");
      inner = animateInsert(nextContent, setValue, opts);
    }
  };
  timer = window.setTimeout(fadeOut, stepDelay);

  return {
    cancel: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      inner?.cancel();
    },
  };
}

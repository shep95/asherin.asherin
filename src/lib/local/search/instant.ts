/**
 * Instant answers computed on the device: arithmetic, unit conversion, and a
 * sourced abstract for a named thing. Nothing is invented — the abstract comes
 * from an encyclopedia summary and is attributed as such.
 */
import type { InstantAnswer } from '@/components/dashboard/search/types';
import { getJson } from './http';
import { rec, str } from './providers/types';

export function detectInstantAnswerType(query: string): string | null {
  const q = query.toLowerCase().trim();
  if (/^[\d\s()+\-*/.^%]+$/.test(q) && /\d/.test(q) && /[+\-*/^%]/.test(q)) return 'math';
  if (/^\d+(\.\d+)?\s*(miles?|mi|km|kilometers?|meters?|m|feet|ft|inches?|in|cm|mm|lbs?|pounds?|kg|kilograms?|oz|ounces?|gallons?|gal|liters?|litres?|l|fahrenheit|f|celsius|c)\s+(to|in)\s+/i.test(q)) return 'unit';
  if (/^(define|definition of|meaning of|what is|what are|who is|who was|where is)\s+/i.test(q)) return 'definition';
  return null;
}

// ── arithmetic: a tiny shunting-yard evaluator, no eval ─────────────────────
export function evalArithmetic(expr: string): number | null {
  const tokens = expr.replace(/\s+/g, '').match(/\d+(\.\d+)?|[()+\-*/^%]/g);
  if (!tokens || tokens.join('') !== expr.replace(/\s+/g, '')) return null;
  const out: number[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };
  const apply = () => {
    const op = ops.pop();
    const b = out.pop();
    const a = out.pop();
    if (op == null || a == null || b == null) throw new Error('bad');
    out.push(op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : op === '/' ? a / b : op === '%' ? a % b : Math.pow(a, b));
  };
  let prev: string | null = null;
  try {
    for (const t of tokens) {
      if (/^\d/.test(t)) out.push(parseFloat(t));
      else if (t === '(') ops.push(t);
      else if (t === ')') {
        while (ops.length && ops[ops.length - 1] !== '(') apply();
        if (ops.pop() !== '(') return null;
      } else {
        // unary minus
        if (t === '-' && (prev === null || /[(+\-*/^%]/.test(prev))) out.push(0);
        while (ops.length && ops[ops.length - 1] !== '(' && (prec[ops[ops.length - 1]] > prec[t] || (prec[ops[ops.length - 1]] === prec[t] && t !== '^'))) apply();
        ops.push(t);
      }
      prev = t;
    }
    while (ops.length) {
      if (ops[ops.length - 1] === '(') return null;
      apply();
    }
  } catch {
    return null;
  }
  if (out.length !== 1 || !Number.isFinite(out[0])) return null;
  return out[0];
}

// ── units ───────────────────────────────────────────────────────────────────
const TO_BASE: Record<string, { base: string; factor: number }> = {
  mi: { base: 'm', factor: 1609.344 }, mile: { base: 'm', factor: 1609.344 }, miles: { base: 'm', factor: 1609.344 },
  km: { base: 'm', factor: 1000 }, kilometer: { base: 'm', factor: 1000 }, kilometers: { base: 'm', factor: 1000 },
  m: { base: 'm', factor: 1 }, meter: { base: 'm', factor: 1 }, meters: { base: 'm', factor: 1 },
  cm: { base: 'm', factor: 0.01 }, mm: { base: 'm', factor: 0.001 },
  ft: { base: 'm', factor: 0.3048 }, feet: { base: 'm', factor: 0.3048 }, foot: { base: 'm', factor: 0.3048 },
  in: { base: 'm', factor: 0.0254 }, inch: { base: 'm', factor: 0.0254 }, inches: { base: 'm', factor: 0.0254 },
  kg: { base: 'kg', factor: 1 }, kilogram: { base: 'kg', factor: 1 }, kilograms: { base: 'kg', factor: 1 },
  lb: { base: 'kg', factor: 0.45359237 }, lbs: { base: 'kg', factor: 0.45359237 }, pound: { base: 'kg', factor: 0.45359237 }, pounds: { base: 'kg', factor: 0.45359237 },
  oz: { base: 'kg', factor: 0.028349523 }, ounce: { base: 'kg', factor: 0.028349523 }, ounces: { base: 'kg', factor: 0.028349523 },
  l: { base: 'l', factor: 1 }, liter: { base: 'l', factor: 1 }, liters: { base: 'l', factor: 1 }, litre: { base: 'l', factor: 1 }, litres: { base: 'l', factor: 1 },
  gal: { base: 'l', factor: 3.785411784 }, gallon: { base: 'l', factor: 3.785411784 }, gallons: { base: 'l', factor: 3.785411784 },
};

export function convertUnits(query: string): { value: number; from: string; to: string } | null {
  const m = query.toLowerCase().match(/^(-?\d+(?:\.\d+)?)\s*([a-z]+)\s+(?:to|in)\s+([a-z]+)$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const from = m[2];
  const to = m[3];
  const temp = (u: string) => (/^(c|celsius)$/.test(u) ? 'c' : /^(f|fahrenheit)$/.test(u) ? 'f' : null);
  const tf = temp(from);
  const tt = temp(to);
  if (tf && tt) {
    const value = tf === tt ? n : tf === 'c' ? (n * 9) / 5 + 32 : ((n - 32) * 5) / 9;
    return { value, from: tf === 'c' ? '°c' : '°f', to: tt === 'c' ? '°c' : '°f' };
  }
  const a = TO_BASE[from];
  const b = TO_BASE[to];
  if (!a || !b || a.base !== b.base) return null;
  return { value: (n * a.factor) / b.factor, from, to };
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toPrecision(6).replace(/\.?0+$/, '');
}

export function localInstantAnswer(query: string): InstantAnswer | null {
  const type = detectInstantAnswerType(query);
  if (type === 'math') {
    const v = evalArithmetic(query.trim());
    return v == null ? null : { type: 'answer', title: query.trim(), value: `= ${fmt(v)}`, source: 'computed on this device' };
  }
  if (type === 'unit') {
    const c = convertUnits(query.trim());
    return c ? { type: 'answer', title: query.trim(), value: `${fmt(c.value)} ${c.to}`, source: 'computed on this device' } : null;
  }
  return null;
}

/** An encyclopedia abstract for the top matching article, attributed. */
export async function wikipediaAbstract(query: string, signal?: AbortSignal): Promise<InstantAnswer | null> {
  const stripped = query.replace(/^(define|definition of|meaning of|what is|what are|who is|who was|where is)\s+/i, '').replace(/\?+$/, '').trim();
  if (!stripped) return null;
  try {
    const search = await getJson<unknown>(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(stripped)}&format=json&srlimit=1&origin=*`,
      { signal, timeoutMs: 5000 },
    );
    const first = (rec(rec(search).query).search as unknown[])?.[0];
    const title = str(rec(first).title);
    if (!title) return null;
    const summary = await getJson<unknown>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { signal, timeoutMs: 5000 });
    const s = rec(summary);
    const extract = str(s.extract);
    if (!extract) return null;
    return {
      type: 'abstract',
      title: str(s.title) || title,
      value: extract.slice(0, 600),
      source: 'Wikipedia',
      details: { url: str(rec(rec(s.content_urls).desktop).page) || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` },
    };
  } catch {
    return null;
  }
}

export async function instantAnswerFor(query: string, signal?: AbortSignal): Promise<InstantAnswer | null> {
  const local = localInstantAnswer(query);
  if (local) return local;
  const words = query.trim().split(/\s+/).filter(Boolean);
  const hasOperator = /\b[a-z]+:\S/i.test(query) || /["\-+]/.test(query);
  // a definition ask, or a short named thing, earns a sourced abstract
  if (detectInstantAnswerType(query) === 'definition' || (words.length <= 4 && !hasOperator)) return wikipediaAbstract(query, signal);
  return null;
}

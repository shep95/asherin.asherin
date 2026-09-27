/**
 * A PostgREST-shaped query builder over the local table store.
 *
 * Every `supabase.from("x").select().eq().order()…` call in the app resolves
 * here. The builder is a thenable, so `await` and `.then()` both work, and it
 * answers with the same `{ data, error, count, status }` envelope the hosted
 * client did. Rows are plain objects; the schema is whatever the app writes.
 */

import { loadTable, mutateTable, uuid, type Row } from "./db";
import { getLocalUser } from "./auth";
import { keyVaultTable } from "./keys";

export interface PgError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export interface PgResponse<T = unknown> {
  data: T | null;
  error: PgError | null;
  count: number | null;
  status: number;
  statusText: string;
}

type Op =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "is" | "in"
  | "cs" | "cd" | "ov" | "fts" | "plfts" | "phfts" | "wfts" | "match" | "imatch";

interface Filter {
  col: string;
  op: Op;
  val: unknown;
  negate?: boolean;
}

interface OrGroup {
  filters: Filter[];
}

type Operation = "select" | "insert" | "update" | "upsert" | "delete";

const OP_ALIASES: Record<string, Op> = {
  eq: "eq", neq: "neq", gt: "gt", gte: "gte", lt: "lt", lte: "lte", like: "like", ilike: "ilike",
  is: "is", in: "in", cs: "cs", cd: "cd", ov: "ov", fts: "fts", plfts: "plfts", phfts: "phfts",
  wfts: "wfts", match: "match", imatch: "imatch", contains: "cs", containedBy: "cd", overlaps: "ov",
};

function getPath(row: Row, col: string): unknown {
  // json paths: meta->>key, meta->key, meta->a->>b
  if (col.includes("->")) {
    const parts = col.split(/->>?/);
    let cur: unknown = row;
    for (const p of parts) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = (cur as Row)[p];
    }
    return cur;
  }
  return row[col];
}

function likeToRegex(pattern: string, flags = ""): RegExp {
  const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${esc}$`, flags);
}

function loose(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return String(a) === String(b);
}

function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" || typeof b === "boolean") return Number(a) - Number(b);
  const na = Number(a), nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== "" && String(b).trim() !== "") return na - nb;
  return String(a).localeCompare(String(b));
}

function coerceOrValue(raw: string): unknown {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw.startsWith("(") && raw.endsWith(")")) {
    return raw.slice(1, -1).split(",").map((s) => s.trim().replace(/^"(.*)"$/, "$1"));
  }
  return raw.replace(/^"(.*)"$/, "$1");
}

function matches(row: Row, f: Filter): boolean {
  const v = getPath(row, f.col);
  let hit: boolean;
  switch (f.op) {
    case "eq": hit = loose(v, f.val); break;
    case "neq": hit = !loose(v, f.val); break;
    case "gt": hit = v != null && cmp(v, f.val) > 0; break;
    case "gte": hit = v != null && cmp(v, f.val) >= 0; break;
    case "lt": hit = v != null && cmp(v, f.val) < 0; break;
    case "lte": hit = v != null && cmp(v, f.val) <= 0; break;
    case "like": hit = typeof v === "string" && likeToRegex(String(f.val)).test(v); break;
    case "ilike": hit = typeof v === "string" && likeToRegex(String(f.val), "i").test(v); break;
    case "match": hit = typeof v === "string" && new RegExp(String(f.val)).test(v); break;
    case "imatch": hit = typeof v === "string" && new RegExp(String(f.val), "i").test(v); break;
    case "is":
      if (f.val === null) hit = v == null;
      else if (f.val === true) hit = v === true;
      else if (f.val === false) hit = v === false;
      else hit = loose(v, f.val);
      break;
    case "in": {
      const arr = Array.isArray(f.val) ? f.val : [f.val];
      hit = arr.some((x) => loose(x, v));
      break;
    }
    case "cs": {
      if (Array.isArray(v)) {
        const want = Array.isArray(f.val) ? f.val : [f.val];
        hit = want.every((w) => v.some((x) => loose(x, w)));
      } else if (v && typeof v === "object" && f.val && typeof f.val === "object") {
        hit = Object.entries(f.val as Row).every(([k, w]) => loose((v as Row)[k], w));
      } else if (typeof v === "string") {
        hit = v.includes(String(f.val));
      } else hit = false;
      break;
    }
    case "cd": {
      if (Array.isArray(v)) {
        const want = Array.isArray(f.val) ? f.val : [f.val];
        hit = v.every((x) => want.some((w) => loose(x, w)));
      } else hit = false;
      break;
    }
    case "ov": {
      const want = Array.isArray(f.val) ? f.val : [f.val];
      hit = Array.isArray(v) && v.some((x) => want.some((w) => loose(x, w)));
      break;
    }
    case "fts": case "plfts": case "phfts": case "wfts": {
      const hay = String(v ?? "").toLowerCase();
      const words = String(f.val ?? "").toLowerCase().split(/[\s&|]+/).filter(Boolean);
      hit = words.every((w) => hay.includes(w.replace(/[:*'"]/g, "")));
      break;
    }
    default: hit = false;
  }
  return f.negate ? !hit : hit;
}

/** Parse "a.eq.1,b.ilike.%x%,and(c.gt.2,d.lt.5)" into a flat OR group. */
function parseOr(expr: string): Filter[] {
  const out: Filter[] = [];
  let depth = 0, cur = "";
  const items: string[] = [];
  for (const ch of expr) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { items.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur) items.push(cur);
  for (const raw of items) {
    const item = raw.trim();
    const m = item.match(/^(and|or)\((.*)\)$/);
    if (m) { out.push(...parseOr(m[2])); continue; }
    const neg = item.startsWith("not.");
    const body = neg ? item.slice(4) : item;
    const first = body.indexOf(".");
    const second = body.indexOf(".", first + 1);
    if (first < 0 || second < 0) continue;
    const col = body.slice(0, first);
    const op = OP_ALIASES[body.slice(first + 1, second)] ?? "eq";
    const val = coerceOrValue(body.slice(second + 1));
    out.push({ col, op, val, negate: neg });
  }
  return out;
}

/** Split "a, b:c, rel(x,y), rel!inner(z)" respecting parentheses. */
function splitSelect(sel: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of sel) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const singular = (t: string) => (t.endsWith("ies") ? t.slice(0, -3) + "y" : t.endsWith("s") ? t.slice(0, -1) : t);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class LocalQuery<T = any> implements PromiseLike<PgResponse<T>> {
  private op: Operation = "select";
  private values: Row[] = [];
  private filters: Filter[] = [];
  private ors: OrGroup[] = [];
  private orders: { col: string; asc: boolean; nullsFirst?: boolean }[] = [];
  private limitN: number | null = null;
  private offsetN = 0;
  private selectCols: string | null = null;
  private wantSingle: "single" | "maybe" | null = null;
  private countMode: "exact" | "planned" | "estimated" | null = null;
  private headOnly = false;
  private onConflict: string[] = ["id"];
  private ignoreDuplicates = false;
  private throwOnErr = false;
  private signal?: AbortSignal;

  constructor(private table: string) {}

  /* ── operations ── */
  select(cols = "*", opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
    if (this.op === "select" || this.selectCols === null) this.selectCols = cols;
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.headOnly = true;
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert(values: any, _opts?: unknown) { this.op = "insert"; this.values = (Array.isArray(values) ? values : [values]) as Row[]; return this; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsert(values: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.values = (Array.isArray(values) ? values : [values]) as Row[];
    if (opts?.onConflict) this.onConflict = opts.onConflict.split(",").map((s) => s.trim()).filter(Boolean);
    this.ignoreDuplicates = !!opts?.ignoreDuplicates;
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update(values: any, _opts?: unknown) { this.op = "update"; this.values = [values as Row]; return this; }
  delete(_opts?: unknown) { this.op = "delete"; return this; }

  /* ── filters ── */
  private add(col: string, op: Op, val: unknown, negate = false) { this.filters.push({ col, op, val, negate }); return this; }
  eq(col: string, val: unknown) { return this.add(col, "eq", val); }
  neq(col: string, val: unknown) { return this.add(col, "neq", val); }
  gt(col: string, val: unknown) { return this.add(col, "gt", val); }
  gte(col: string, val: unknown) { return this.add(col, "gte", val); }
  lt(col: string, val: unknown) { return this.add(col, "lt", val); }
  lte(col: string, val: unknown) { return this.add(col, "lte", val); }
  like(col: string, val: string) { return this.add(col, "like", val); }
  ilike(col: string, val: string) { return this.add(col, "ilike", val); }
  likeAllOf(col: string, vals: string[]) { for (const v of vals) this.add(col, "like", v); return this; }
  ilikeAnyOf(col: string, vals: string[]) { this.ors.push({ filters: vals.map((v) => ({ col, op: "ilike" as Op, val: v })) }); return this; }
  is(col: string, val: unknown) { return this.add(col, "is", val); }
  in(col: string, vals: unknown[]) { return this.add(col, "in", vals); }
  contains(col: string, val: unknown) { return this.add(col, "cs", val); }
  containedBy(col: string, val: unknown) { return this.add(col, "cd", val); }
  overlaps(col: string, val: unknown) { return this.add(col, "ov", val); }
  textSearch(col: string, q: string, _opts?: unknown) { return this.add(col, "fts", q); }
  match(obj: Record<string, unknown>) { for (const [k, v] of Object.entries(obj)) this.add(k, "eq", v); return this; }
  not(col: string, op: string, val: unknown) {
    const o = OP_ALIASES[op] ?? "eq";
    return this.add(col, o, o === "in" && typeof val === "string" ? coerceOrValue(val) : val, true);
  }
  or(expr: string, _opts?: unknown) { this.ors.push({ filters: parseOr(expr) }); return this; }
  filter(col: string, op: string, val: unknown) {
    const neg = op.startsWith("not.");
    const o = OP_ALIASES[neg ? op.slice(4) : op] ?? "eq";
    return this.add(col, o, o === "in" && typeof val === "string" ? coerceOrValue(val) : val, neg);
  }

  /* ── modifiers ── */
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string }) {
    if (!opts?.foreignTable && !opts?.referencedTable) this.orders.push({ col, asc: opts?.ascending !== false, nullsFirst: opts?.nullsFirst });
    return this;
  }
  limit(n: number, _opts?: unknown) { this.limitN = n; return this; }
  range(from: number, to: number, _opts?: unknown) { this.offsetN = from; this.limitN = to - from + 1; return this; }
  single() { this.wantSingle = "single"; return this as unknown as LocalQuery<T>; }
  maybeSingle() { this.wantSingle = "maybe"; return this as unknown as LocalQuery<T>; }
  throwOnError() { this.throwOnErr = true; return this; }
  abortSignal(s: AbortSignal) { this.signal = s; return this; }
  returns<U>() { return this as unknown as LocalQuery<U>; }
  overrideTypes<U>() { return this as unknown as LocalQuery<U>; }
  csv() { return this; }
  explain() { return this; }
  setHeader() { return this; }

  /* ── execution ── */
  private applyFilters(rows: Row[]): Row[] {
    return rows.filter((r) => this.filters.every((f) => matches(r, f)) && this.ors.every((g) => g.filters.length === 0 || g.filters.some((f) => matches(r, f))));
  }

  private applyOrder(rows: Row[]): Row[] {
    if (!this.orders.length) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      for (const o of this.orders) {
        const va = getPath(a, o.col), vb = getPath(b, o.col);
        if (va == null && vb == null) continue;
        if (va == null) return o.nullsFirst ? -1 : 1;
        if (vb == null) return o.nullsFirst ? 1 : -1;
        const c = cmp(va, vb);
        if (c !== 0) return o.asc ? c : -c;
      }
      return 0;
    });
    return sorted;
  }

  private async project(rows: Row[]): Promise<Row[]> {
    const sel = this.selectCols ?? "*";
    if (sel.trim() === "*" || sel.trim() === "") return rows.map((r) => ({ ...r }));
    const items = splitSelect(sel);
    const out: Row[] = [];
    for (const r of rows) {
      const o: Row = {};
      let star = false;
      for (const item of items) {
        if (item === "*") { star = true; continue; }
        const rel = item.match(/^([a-zA-Z_][\w]*)(?::([a-zA-Z_][\w]*))?(?:!\w+)?\((.*)\)$/);
        if (rel) {
          const alias = rel[1];
          const relTable = rel[2] && !rel[2].includes("_fkey") ? rel[2] : rel[1];
          o[alias] = await this.embed(r, relTable, rel[3]);
          continue;
        }
        const aliased = item.match(/^([a-zA-Z_][\w]*):([\w>-]+)(?:::\w+)?$/);
        if (aliased) { o[aliased[1]] = getPath(r, aliased[2]); continue; }
        const plain = item.replace(/::\w+$/, "");
        o[plain] = getPath(r, plain);
      }
      out.push(star ? { ...r, ...o } : o);
    }
    return out;
  }

  private async embed(row: Row, relTable: string, cols: string): Promise<unknown> {
    const relRows = await loadTable(relTable);
    const fkOnRow = `${singular(relTable)}_id`;
    const fkOnRel = `${singular(this.table)}_id`;
    const q = new LocalQuery(relTable).select(cols || "*");
    if (row[fkOnRow] != null) {
      const hit = relRows.find((x) => loose(x.id, row[fkOnRow]));
      return hit ? (await q.project([hit]))[0] : null;
    }
    if (row[relTable + "_id"] != null) {
      const hit = relRows.find((x) => loose(x.id, row[relTable + "_id"]));
      return hit ? (await q.project([hit]))[0] : null;
    }
    const many = relRows.filter((x) => loose(x[fkOnRel], row.id));
    return q.project(many);
  }

  private finish(data: unknown, count: number | null, error: PgError | null = null): PgResponse<T> {
    const res: PgResponse<T> = {
      data: (error ? null : data) as T | null,
      error,
      count,
      status: error ? Number(error.code === "PGRST116" ? 406 : 400) : this.op === "insert" ? 201 : 200,
      statusText: error ? "Bad Request" : "OK",
    };
    if (error && this.throwOnErr) throw Object.assign(new Error(error.message), error);
    return res;
  }

  private shape(rows: Row[]): { data: unknown; error: PgError | null } {
    if (this.wantSingle === "single") {
      if (rows.length === 1) return { data: rows[0], error: null };
      return {
        data: null,
        error: {
          message: rows.length === 0 ? "JSON object requested, multiple (or no) rows returned" : "JSON object requested, multiple (or no) rows returned",
          code: "PGRST116",
          details: `The result contains ${rows.length} rows`,
        },
      };
    }
    if (this.wantSingle === "maybe") {
      if (rows.length > 1) return { data: null, error: { message: "JSON object requested, multiple rows returned", code: "PGRST116" } };
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  async execute(): Promise<PgResponse<T>> {
    if (this.signal?.aborted) return this.finish(null, null, { message: "aborted", code: "ABORTED" });
    try {
      const vault = keyVaultTable(this.table);
      if (vault) {
        const rows = await vault({ op: this.op, values: this.values, filters: this.filters });
        const filtered = this.op === "select" ? this.applyOrder(this.applyFilters(rows)) : rows;
        const shaped = this.shape(this.selectCols === null && this.op !== "select" ? [] : await this.project(filtered));
        return this.finish(this.selectCols === null && this.op !== "select" ? null : shaped.data, filtered.length, shaped.error);
      }
      switch (this.op) {
        case "select": {
          const all = await loadTable(this.table);
          const filtered = this.applyOrder(this.applyFilters(all));
          const total = filtered.length;
          const page = filtered.slice(this.offsetN, this.limitN != null ? this.offsetN + this.limitN : undefined);
          if (this.headOnly) return this.finish(null, this.countMode ? total : null);
          const projected = await this.project(page);
          const shaped = this.shape(projected);
          return this.finish(shaped.data, this.countMode ? total : null, shaped.error);
        }
        case "insert": {
          const user = getLocalUser();
          const now = new Date().toISOString();
          const inserted = await mutateTable(this.table, (rows) => {
            const added: Row[] = this.values.map((v) => {
              const r: Row = { ...v };
              if (r.id == null) r.id = uuid();
              if (r.created_at == null) r.created_at = now;
              if (r.user_id === undefined) r.user_id = user.id;
              return r;
            });
            return { rows: rows.concat(added), result: added };
          });
          return this.reply(inserted);
        }
        case "upsert": {
          const user = getLocalUser();
          const now = new Date().toISOString();
          const keys = this.onConflict;
          const written = await mutateTable(this.table, (rows) => {
            const next = [...rows];
            const result: Row[] = [];
            for (const v of this.values) {
              const idx = next.findIndex((r) => keys.every((k) => v[k] !== undefined && loose(r[k], v[k])));
              if (idx >= 0) {
                if (this.ignoreDuplicates) { result.push(next[idx]); continue; }
                const merged = { ...next[idx], ...v };
                if ("updated_at" in merged && v.updated_at === undefined) merged.updated_at = now;
                next[idx] = merged;
                result.push(merged);
              } else {
                const r: Row = { ...v };
                if (r.id == null) r.id = uuid();
                if (r.created_at == null) r.created_at = now;
                if (r.user_id === undefined) r.user_id = user.id;
                next.push(r);
                result.push(r);
              }
            }
            return { rows: next, result };
          });
          return this.reply(written);
        }
        case "update": {
          const patch = this.values[0] ?? {};
          const now = new Date().toISOString();
          const updated = await mutateTable(this.table, (rows) => {
            const result: Row[] = [];
            const next = rows.map((r) => {
              if (!this.filters.every((f) => matches(r, f)) || !this.ors.every((g) => !g.filters.length || g.filters.some((f) => matches(r, f)))) return r;
              const merged = { ...r, ...patch };
              if ("updated_at" in r && patch.updated_at === undefined) merged.updated_at = now;
              result.push(merged);
              return merged;
            });
            return { rows: next, result };
          });
          return this.reply(updated);
        }
        case "delete": {
          const removed = await mutateTable(this.table, (rows) => {
            const result: Row[] = [];
            const next = rows.filter((r) => {
              const hit = this.filters.every((f) => matches(r, f)) && this.ors.every((g) => !g.filters.length || g.filters.some((f) => matches(r, f)));
              if (hit) result.push(r);
              return !hit;
            });
            return { rows: next, result };
          });
          return this.reply(removed);
        }
      }
    } catch (e) {
      return this.finish(null, null, { message: e instanceof Error ? e.message : String(e), code: "LOCAL" });
    }
  }

  private async reply(rows: Row[]): Promise<PgResponse<T>> {
    if (this.selectCols === null) return this.finish(null, rows.length);
    const projected = await this.project(this.applyOrder(rows));
    const shaped = this.shape(projected);
    return this.finish(shaped.data, rows.length, shaped.error);
  }

  then<R1 = PgResponse<T>, R2 = never>(
    onfulfilled?: ((value: PgResponse<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }
  catch<R = never>(onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null): Promise<PgResponse<T> | R> {
    return this.execute().catch(onrejected);
  }
  finally(onfinally?: (() => void) | null): Promise<PgResponse<T>> {
    return this.execute().finally(onfinally);
  }
}

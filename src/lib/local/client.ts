/**
 * The local client: everything `supabase.*` used to be, on this device.
 */

import { LocalQuery } from "./postgrest";
import { localAuth } from "./auth";
import { localStorageBuckets } from "./storage";
import { localFunctions, localOnlyMessage } from "./functions";
import { loadTable, mutateTable, onTableChange, type Row } from "./db";

/* ── rpc ────────────────────────────────────────────────────────────────── */

type RpcHandler = (args: Record<string, unknown>) => Promise<unknown>;

const counters = async (name: string, delta: number) => {
  const rows = await mutateTable("_local_counters", (rows) => {
    const idx = rows.findIndex((r) => r.name === name);
    if (idx >= 0) rows[idx] = { ...rows[idx], count: Number(rows[idx].count ?? 0) + delta };
    else rows.push({ id: name, name, count: delta });
    return { rows, result: rows };
  });
  return Number(rows.find((r) => r.name === name)?.count ?? 0);
};

const RPC: Record<string, RpcHandler> = {
  delete_conversation: async (args) => {
    const id = String(args._conversation_id ?? args.conversation_id ?? args.p_conversation_id ?? "");
    if (!id) return null;
    await mutateTable("messages", (rows) => ({ rows: rows.filter((r) => r.conversation_id !== id), result: null }));
    await mutateTable("conversations", (rows) => ({ rows: rows.filter((r) => r.id !== id), result: null }));
    return null;
  },
  soft_delete_asher_message: async () => null,
  record_download: async (args) => counters(String(args._slug ?? args.slug ?? "download"), 1),
  get_download_count: async (args) => counters(String(args._slug ?? args.slug ?? "download"), 0),
  try_acquire_intel_slot: async () => true,
  heartbeat_intel_slot: async () => true,
  release_intel_slot: async () => true,
  ble_can_claim: async () => true,
  mesh_roster: async () => [],
  locate_owned_device: async () => null,
  locate_owned_devices_group: async () => [],
  analytics_overview: async () => null,
  analytics_live: async () => [],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcResult = { data: any; error: { message: string; code?: string } | null };
class RpcCall implements PromiseLike<RpcResult> {
  private p: Promise<RpcResult>;
  constructor(name: string, args: Record<string, unknown>) {
    const h = RPC[name];
    this.p = h
      ? h(args).then(
          (data) => ({ data, error: null }),
          (e) => ({ data: null, error: { message: e instanceof Error ? e.message : String(e), code: "LOCAL" } }),
        )
      : Promise.resolve({ data: null, error: { message: localOnlyMessage(`rpc ${name}`), code: "LOCAL_ONLY" } });
  }
  select() { return this; }
  single() { return this; }
  maybeSingle() { return this; }
  eq() { return this; }
  order() { return this; }
  limit() { return this; }
  throwOnError() { return this; }
  then<R1 = unknown, R2 = never>(f?: ((v: RpcResult) => R1 | PromiseLike<R1>) | null, r?: ((e: unknown) => R2 | PromiseLike<R2>) | null) {
    return this.p.then(f, r);
  }
}

/* ── realtime ───────────────────────────────────────────────────────────── */

class LocalChannel {
  private unsubs: (() => void)[] = [];
  private state = "closed";
  constructor(public topic: string) {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(type: string, filter: { event?: string; table?: string; schema?: string; filter?: string } | string, cb?: (payload: any) => void) {
    // postgres_changes on a table: fire the callback on any local write to it.
    if (type === "postgres_changes" && typeof filter === "object" && filter.table && cb) {
      const table = filter.table;
      this.unsubs.push(
        onTableChange(table, () => {
          void loadTable(table).then((rows: Row[]) => {
            cb({ eventType: "UPDATE", schema: "public", table, new: rows[rows.length - 1] ?? {}, old: {}, commit_timestamp: new Date().toISOString() });
          });
        }),
      );
    }
    return this;
  }
  subscribe(cb?: (status: string, err?: Error) => void) {
    this.state = "joined";
    try {
      cb?.("SUBSCRIBED");
    } catch {
      /* listener */
    }
    return this;
  }
  async unsubscribe() {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.state = "closed";
    return "ok" as const;
  }
  async send(..._args: unknown[]) { return "ok" as const; }
  async track(..._args: unknown[]) { return "ok" as const; }
  async untrack(..._args: unknown[]) { return "ok" as const; }
  presenceState() { return {}; }
  get joined() { return this.state === "joined"; }
}

const channels = new Set<LocalChannel>();

/* ── client ─────────────────────────────────────────────────────────────── */

export function createLocalClient() {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from<T = any>(table: string) {
      return new LocalQuery<T>(table);
    },
    rpc(name: string, args: Record<string, unknown> = {}) {
      return new RpcCall(name, args);
    },
    auth: localAuth,
    storage: localStorageBuckets,
    functions: localFunctions,
    channel(topic: string, _opts?: unknown) {
      const c = new LocalChannel(topic);
      channels.add(c);
      return c;
    },
    async removeChannel(c: LocalChannel) {
      channels.delete(c);
      await c.unsubscribe();
      return "ok" as const;
    },
    async removeAllChannels() {
      for (const c of channels) await c.unsubscribe();
      channels.clear();
      return [];
    },
    getChannels() {
      return [...channels];
    },
    realtime: { setAuth() {}, connect() {}, disconnect() {} },
    supabaseUrl: "local://asherin",
    supabaseKey: "local",
  };
}

export type LocalClient = ReturnType<typeof createLocalClient>;

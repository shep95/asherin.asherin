/**
 * `supabase.storage` replacement — buckets live in the local db's blob store.
 * URLs handed back are object URLs for this tab; they are never shareable and
 * never leave the device.
 */

import { blobDel, blobGet, blobKeys, blobPut, uuid, type BlobRecord } from "./db";

interface StorageErr { message: string; name?: string; status?: number }
const err = (message: string, status = 400): StorageErr => ({ message, name: "StorageError", status });

const urlCache = new Map<string, string>();

function objectUrl(bucket: string, path: string, rec: BlobRecord): string {
  const k = `${bucket}/${path}`;
  const hit = urlCache.get(k);
  if (hit) return hit;
  const u = URL.createObjectURL(rec.blob);
  urlCache.set(k, u);
  return u;
}

function dropUrl(bucket: string, path: string) {
  const k = `${bucket}/${path}`;
  const u = urlCache.get(k);
  if (u) {
    URL.revokeObjectURL(u);
    urlCache.delete(k);
  }
}

function toBlob(body: unknown, contentType?: string): Blob {
  if (body instanceof Blob) return body;
  if (typeof body === "string") return new Blob([body], { type: contentType || "text/plain" });
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return new Blob([body as BlobPart], { type: contentType || "application/octet-stream" });
  return new Blob([JSON.stringify(body)], { type: contentType || "application/json" });
}

function normalise(path: string): string {
  return path.replace(/^\/+/, "");
}

class LocalBucket {
  constructor(private bucket: string) {}

  async upload(path: string, body: unknown, opts?: { contentType?: string; upsert?: boolean; cacheControl?: string }) {
    const p = normalise(path);
    const existing = await blobGet(this.bucket, p);
    if (existing && !opts?.upsert) return { data: null, error: err("The resource already exists", 409) };
    const blob = toBlob(body, opts?.contentType);
    const now = new Date().toISOString();
    const rec: BlobRecord = {
      blob,
      contentType: opts?.contentType || blob.type || "application/octet-stream",
      size: blob.size,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await blobPut(this.bucket, p, rec);
    dropUrl(this.bucket, p);
    return { data: { path: p, id: uuid(), fullPath: `${this.bucket}/${p}` }, error: null };
  }

  async update(path: string, body: unknown, opts?: { contentType?: string }) {
    return this.upload(path, body, { ...opts, upsert: true });
  }

  async download(path: string) {
    const rec = await blobGet(this.bucket, normalise(path));
    if (!rec) return { data: null, error: err("Object not found", 404) };
    return { data: rec.blob, error: null };
  }

  async list(prefix = "", opts?: { limit?: number; offset?: number; search?: string; sortBy?: { column?: string; order?: string } }) {
    const keys = await blobKeys(this.bucket);
    const pre = prefix ? normalise(prefix).replace(/\/+$/, "") + "/" : "";
    const seen = new Map<string, { name: string; id: string | null; isFolder: boolean; key: string }>();
    for (const k of keys) {
      if (pre && !k.startsWith(pre)) continue;
      const rest = k.slice(pre.length);
      const slash = rest.indexOf("/");
      const name = slash >= 0 ? rest.slice(0, slash) : rest;
      if (!name) continue;
      if (opts?.search && !name.toLowerCase().includes(opts.search.toLowerCase())) continue;
      if (!seen.has(name)) seen.set(name, { name, id: slash >= 0 ? null : uuid(), isFolder: slash >= 0, key: k });
    }
    const items = [] as { name: string; id: string | null; updated_at: string | null; created_at: string | null; last_accessed_at: string | null; metadata: Record<string, unknown> | null }[];
    for (const it of seen.values()) {
      if (it.isFolder) {
        items.push({ name: it.name, id: null, updated_at: null, created_at: null, last_accessed_at: null, metadata: null });
        continue;
      }
      const rec = await blobGet(this.bucket, it.key);
      items.push({
        name: it.name,
        id: it.id,
        updated_at: rec?.updatedAt ?? null,
        created_at: rec?.createdAt ?? null,
        last_accessed_at: rec?.updatedAt ?? null,
        metadata: rec ? { size: rec.size, mimetype: rec.contentType, eTag: "", cacheControl: "", lastModified: rec.updatedAt, contentLength: rec.size, httpStatusCode: 200 } : null,
      });
    }
    const col = opts?.sortBy?.column || "name";
    const desc = (opts?.sortBy?.order || "asc").toLowerCase() === "desc";
    items.sort((a, b) => String((a as Record<string, unknown>)[col] ?? "").localeCompare(String((b as Record<string, unknown>)[col] ?? "")) * (desc ? -1 : 1));
    const off = opts?.offset ?? 0;
    return { data: items.slice(off, opts?.limit != null ? off + opts.limit : undefined), error: null };
  }

  async remove(paths: string[]) {
    const removed: Record<string, unknown>[] = [];
    for (const p of paths) {
      const n = normalise(p);
      const rec = await blobGet(this.bucket, n);
      if (!rec) continue;
      await blobDel(this.bucket, n);
      dropUrl(this.bucket, n);
      removed.push({ name: n, bucket_id: this.bucket });
    }
    return { data: removed, error: null };
  }

  async move(from: string, to: string) {
    const rec = await blobGet(this.bucket, normalise(from));
    if (!rec) return { data: null, error: err("Object not found", 404) };
    await blobPut(this.bucket, normalise(to), rec);
    await blobDel(this.bucket, normalise(from));
    dropUrl(this.bucket, normalise(from));
    return { data: { message: "Successfully moved" }, error: null };
  }

  async copy(from: string, to: string) {
    const rec = await blobGet(this.bucket, normalise(from));
    if (!rec) return { data: null, error: err("Object not found", 404) };
    await blobPut(this.bucket, normalise(to), { ...rec });
    return { data: { path: normalise(to) }, error: null };
  }

  async createSignedUrl(path: string, _expiresIn?: number, _opts?: unknown) {
    const rec = await blobGet(this.bucket, normalise(path));
    if (!rec) return { data: null, error: err("Object not found", 404) };
    return { data: { signedUrl: objectUrl(this.bucket, normalise(path), rec) }, error: null };
  }

  async createSignedUrls(paths: string[], expiresIn?: number) {
    const out = [] as { path: string; signedUrl: string | null; error: string | null }[];
    for (const p of paths) {
      const r = await this.createSignedUrl(p, expiresIn);
      out.push({ path: p, signedUrl: r.data?.signedUrl ?? null, error: r.error?.message ?? null });
    }
    return { data: out, error: null };
  }

  async createSignedUploadUrl(path: string) {
    return { data: { signedUrl: `local://${this.bucket}/${normalise(path)}`, token: "local", path: normalise(path) }, error: null };
  }

  async uploadToSignedUrl(path: string, _token: string, body: unknown, opts?: { contentType?: string }) {
    return this.upload(path, body, { ...opts, upsert: true });
  }

  getPublicUrl(path: string, _opts?: unknown) {
    const n = normalise(path);
    const cached = urlCache.get(`${this.bucket}/${n}`);
    if (cached) return { data: { publicUrl: cached } };
    // Not in memory yet: warm it for the next paint and hand back a stable
    // same-origin marker meanwhile. `<img>` consumers get a broken image for
    // one tick, never an off-device request.
    void blobGet(this.bucket, n).then((rec) => rec && objectUrl(this.bucket, n, rec));
    return { data: { publicUrl: `data:,` } };
  }
}

export const localStorageBuckets = {
  from(bucket: string) {
    return new LocalBucket(bucket);
  },
  async listBuckets() {
    return { data: [], error: null };
  },
  async getBucket(id: string) {
    return { data: { id, name: id, public: false }, error: null };
  },
  async createBucket(id: string) {
    return { data: { name: id }, error: null };
  },
};

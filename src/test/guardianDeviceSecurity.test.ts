import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { enablePassphrase, getProviderKey, lockVault, saveProviderKey, unlockVault, vaultLockState } from "@/lib/local/keys";
import {
  changePassphrase,
  describeLock,
  describeNotify,
  providerName,
  readEncryptionFacts,
  readNotifyState,
  readTrail,
  readVaultFacts,
  recommend,
  recordTrail,
  trailLabel,
  whiteboardSealedState,
  type EncryptionFacts,
  type VaultFacts,
} from "@/lib/guardian/deviceSecurity";

const uid = "33333333-3333-4333-8333-333333333333";
const key = (provider: string): VaultFacts["keys"][number] => ({
  provider,
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});
const enc = (over: Partial<EncryptionFacts> = {}): EncryptionFacts => ({
  messagesTotal: 0,
  messagesEncrypted: 0,
  vaultItems: 0,
  whiteboardSealed: null,
  ...over,
});

describe("guardian vault — pure facts", () => {
  it("describes the lock in one lowercase sentence per state", () => {
    expect(describeLock({ mode: "device", unlocked: true })).toMatch(/^device key/);
    expect(describeLock({ mode: "passphrase", unlocked: true })).toMatch(/unlocked for this tab/);
    expect(describeLock({ mode: "passphrase", unlocked: false })).toMatch(/locked — saved keys cannot be read/);
  });

  it("keeps provider proper names and passes unknown ids through", () => {
    expect(providerName("openai")).toBe("OpenAI");
    expect(providerName("Anthropic")).toBe("Anthropic");
    expect(providerName("my-proxy")).toBe("my-proxy");
  });

  it("recommends a passphrase only when there are keys to protect in device mode", () => {
    const withKeys = recommend({ mode: "device", unlocked: true, keys: [key("openai")] }, enc());
    expect(withKeys.map((r) => r.id)).toEqual(["add-passphrase"]);
    expect(withKeys[0].tone).toBe("amber");

    const noKeys = recommend({ mode: "device", unlocked: true, keys: [] }, enc());
    expect(noKeys.map((r) => r.id)).toEqual(["all-clear", "no-keys"]);
  });

  it("asks for a lock when unlocked, and flags plain-text chat rows", () => {
    const r = recommend({ mode: "passphrase", unlocked: true, keys: [key("openai")] }, enc({ messagesTotal: 10, messagesEncrypted: 7 }));
    expect(r.map((x) => x.id)).toEqual(["lock-now", "plain-messages"]);
    expect(r[1].title).toBe("3 chat messages stored as plain text");

    const locked = recommend({ mode: "passphrase", unlocked: false, keys: [key("openai")] }, enc({ messagesTotal: 4, messagesEncrypted: 4 }));
    expect(locked.map((x) => x.id)).toEqual(["all-clear"]);
  });

  it("never counts more plain rows than exist", () => {
    const r = recommend({ mode: "passphrase", unlocked: false, keys: [key("a")] }, enc({ messagesTotal: 2, messagesEncrypted: 5 }));
    expect(r.find((x) => x.id === "plain-messages")).toBeUndefined();
  });

  it("reads whiteboard envelopes without parsing them", () => {
    const store = (entries: Record<string, string>) => ({
      length: Object.keys(entries).length,
      key: (i: number) => Object.keys(entries)[i] ?? null,
      getItem: (k: string) => entries[k] ?? null,
    });
    expect(whiteboardSealedState(store({}))).toBeNull();
    expect(whiteboardSealedState(store({ other: "x" }))).toBeNull();
    expect(whiteboardSealedState(store({ "aureon-whiteboards-v3:u1": "ENC:abc" }))).toBe(true);
    expect(whiteboardSealedState(store({ "aureon-whiteboards-v3:u1": "ENC:abc", "aureon-whiteboards-v3:u2": "{}" }))).toBe(false);
  });

  it("labels trail actions in lowercase and degrades unknown ones", () => {
    expect(trailLabel({ action: "vault_locked" })).toBe("vault locked");
    expect(trailLabel({ action: "Something_Else" })).toBe("something else");
  });

  it("has a device answer for every notification permission state", () => {
    expect(readNotifyState()).toBe("unsupported"); // jsdom has no Notification api
    for (const s of ["unsupported", "denied", "default", "granted"] as const) {
      expect(describeNotify(s)).toMatch(/^[a-z]/);
    }
  });
});

describe("guardian vault — on-device readers", () => {
  it("writes to and reads the same audit_log the activity room shows, newest first", async () => {
    await recordTrail("vault_locked", "key_vault");
    await new Promise((r) => setTimeout(r, 5));
    await recordTrail("item_created", "vault_item", { kind: "login" });
    const trail = await readTrail();
    expect(trail.length).toBeGreaterThanOrEqual(2);
    expect(trail[0].action).toBe("item_created");
    expect(trail[0].resource_type).toBe("vault_item");
    expect(trail[0].details).toEqual({ kind: "login" });
    const { data } = await supabase.from("audit_log").select("action").eq("action", "vault_locked");
    expect(data).toHaveLength(1);
  });

  it("counts sealed chat rows and vault items from the real tables", async () => {
    await supabase.from("messages").insert([
      { conversation_id: "c1", role: "user", content: "ENC:AAAA" },
      { conversation_id: "c1", role: "assistant", content: "ENC:BBBB" },
      { conversation_id: "c1", role: "user", content: "plain old row" },
    ] as never);
    await supabase.from("vault_items").insert([{ user_id: uid, kind: "note", label: "n", payload_cipher: "ENC:x" }] as never);
    const facts = await readEncryptionFacts(uid);
    expect(facts.messagesTotal).toBe(3);
    expect(facts.messagesEncrypted).toBe(2);
    expect(facts.vaultItems).toBe(1);
    expect(facts.whiteboardSealed).toBeNull();
  });

  it("changes the passphrase in place: old one stops working, keys survive", async () => {
    await saveProviderKey("openai", "sk-live-0000000000000000");
    await enablePassphrase("first passphrase");
    expect((await readVaultFacts()).mode).toBe("passphrase");

    await expect(changePassphrase("first passphrase", "short")).rejects.toThrow(/at least 8/);
    await expect(changePassphrase("not it at all", "second passphrase")).rejects.toThrow(/did not open/);
    await expect(changePassphrase("first passphrase", "first passphrase")).rejects.toThrow(/same/);

    await changePassphrase("first passphrase", "second passphrase");
    const facts = await readVaultFacts();
    expect(facts.mode).toBe("passphrase");
    expect(facts.unlocked).toBe(true);
    expect(facts.keys.map((k) => k.provider)).toEqual(["openai"]);
    expect(await getProviderKey("openai")).toBe("sk-live-0000000000000000");

    lockVault();
    expect((await vaultLockState()).unlocked).toBe(false);
    expect(await unlockVault("first passphrase")).toBe(false);
    expect(await unlockVault("second passphrase")).toBe(true);
    expect(await getProviderKey("openai")).toBe("sk-live-0000000000000000");
  });
});

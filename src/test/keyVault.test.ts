import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { enablePassphrase, getProviderKey, lockVault, saveProviderKey, unlockVault, vaultLockState, VaultLockedError } from "@/lib/local/keys";

describe("device key vault", () => {
  it("a saved key comes back on this device, is refused while locked, and returns after unlock", async () => {
    await saveProviderKey("openai", "sk-test-1234567890abcdef");
    expect(await getProviderKey("openai")).toBe("sk-test-1234567890abcdef");
    expect((await vaultLockState()).mode).toBe("device");

    await enablePassphrase("correct horse battery");
    expect((await vaultLockState()).mode).toBe("passphrase");
    expect(await getProviderKey("openai")).toBe("sk-test-1234567890abcdef");

    lockVault();
    expect((await vaultLockState()).unlocked).toBe(false);
    await expect(getProviderKey("openai")).rejects.toBeInstanceOf(VaultLockedError);

    expect(await unlockVault("wrong passphrase")).toBe(false);
    await expect(getProviderKey("openai")).rejects.toBeInstanceOf(VaultLockedError);

    expect(await unlockVault("correct horse battery")).toBe(true);
    expect(await getProviderKey("openai")).toBe("sk-test-1234567890abcdef");
  });
});

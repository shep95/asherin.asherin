import { describe, it, expect } from "vitest";
import { deriveOrgAnchors } from "@/lib/cloudIntel/orgAnchor";

const msg = (o: Partial<Record<string, any>>) => ({ id: o.id ?? Math.random().toString(36), ...o }) as any;

describe("deriveOrgAnchors", () => {
  it("binds a corporate mailbox as the strongest anchor", () => {
    const a = deriveOrgAnchors({ emails: ["jane@northwind-logistics.com"] });
    expect(a[0]).toMatchObject({ value: "northwind-logistics.com", kind: "domain" });
  });

  it("never treats a consumer provider as an employer", () => {
    const a = deriveOrgAnchors({ emails: ["brunodebritoma@gmail.com"] });
    expect(a.map((x) => x.value)).not.toContain("gmail.com");
  });

  it("recovers the org axis for a freemail contact from shared threads", () => {
    const messages = [
      msg({ threadId: "t1", from: "bruno@gmail.com", to: "me@x.com, ops@northwind-logistics.com" }),
      msg({ threadId: "t2", from: "ops@northwind-logistics.com", to: "bruno@gmail.com, me@x.com" }),
    ];
    const a = deriveOrgAnchors({
      emails: ["bruno@gmail.com"],
      messages,
      ownAddresses: ["me@x.com"],
    });
    expect(a.map((x) => x.value)).toContain("northwind-logistics.com");
  });

  it("requires two distinct threads before trusting a co-recipient domain", () => {
    const messages = [
      msg({ threadId: "t1", from: "bruno@gmail.com", to: "me@x.com, ops@northwind-logistics.com" }),
      msg({ threadId: "t1", from: "me@x.com", to: "bruno@gmail.com, ops@northwind-logistics.com" }),
    ];
    const a = deriveOrgAnchors({ emails: ["bruno@gmail.com"], messages, ownAddresses: ["me@x.com"] });
    expect(a.map((x) => x.value)).not.toContain("northwind-logistics.com");
  });

  it("ignores infrastructure senders and bulk blasts", () => {
    const messages = [
      msg({ threadId: "t1", from: "bruno@gmail.com", to: "me@x.com, no-reply@sendgrid.net" }),
      msg({ threadId: "t2", from: "bruno@gmail.com", to: "me@x.com, no-reply@sendgrid.net" }),
      msg({ threadId: "t3", isBulk: true, from: "bruno@gmail.com", to: "me@x.com, hr@bulkco.com" }),
      msg({ threadId: "t4", isBulk: true, from: "bruno@gmail.com", to: "me@x.com, hr@bulkco.com" }),
    ];
    const a = deriveOrgAnchors({ emails: ["bruno@gmail.com"], messages, ownAddresses: ["me@x.com"] });
    expect(a.map((x) => x.value)).not.toContain("sendgrid.net");
    expect(a.map((x) => x.value)).not.toContain("bulkco.com");
  });

  it("ranks the address-book employer above a traffic-inferred domain", () => {
    const messages = [
      msg({ threadId: "t1", from: "bruno@gmail.com", to: "me@x.com, ops@northwind-logistics.com" }),
      msg({ threadId: "t2", from: "ops@northwind-logistics.com", to: "bruno@gmail.com" }),
    ];
    const a = deriveOrgAnchors({
      emails: ["bruno@gmail.com"],
      organization: "Harbor Freight Forwarding",
      messages,
      ownAddresses: ["me@x.com"],
    });
    expect(a[0].value).toBe("Harbor Freight Forwarding");
    expect(a[0].kind).toBe("name");
  });
});

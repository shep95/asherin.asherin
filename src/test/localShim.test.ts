import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { supabase } from "@/integrations/supabase/client";

const uid = "22222222-2222-4222-8222-222222222222";

describe("on-device query shim", () => {
  it("a flag the row never received reads as false", async () => {
    await supabase.from("conversations").insert({ user_id: uid, title: "older row", mode: "chat" } as never);
    const { data } = await supabase.from("conversations").select("id,title,archived").eq("user_id", uid).eq("archived", false);
    expect(data?.map((r) => (r as { title: string }).title)).toContain("older row");
    const gone = await supabase.from("conversations").select("id").eq("user_id", uid).eq("archived", true);
    expect(gone.data).toHaveLength(0);
  });

  it("insert applies the hosted schema's defaults for the tables that need them", async () => {
    const { data } = await supabase.from("notebooks").insert({ title: "nb", description: "", owner_id: uid } as never).select().single();
    expect((data as { tags: string[] }).tags).toEqual([]);
    expect((data as { status: string }).status).toBe("draft");
    const conv = await supabase.from("conversations").insert({ user_id: uid, title: "c", mode: "chat" } as never).select().single();
    expect((conv.data as { archived: boolean }).archived).toBe(false);
    expect((conv.data as { pinned: boolean }).pinned).toBe(false);
  });

  it("like and ilike span newlines, as they do in postgres", async () => {
    await supabase.from("library_files").insert({ user_id: uid, file_name: "note.txt", file_size: 1, file_type: "text/plain", storage_path: "p", project_id: null, extracted_text: "first line\nsecond line mentions tls\nthird" } as never);
    const hit = await supabase.from("library_files").select("id").eq("user_id", uid).ilike("extracted_text", "%TLS%");
    expect(hit.data).toHaveLength(1);
    const orHit = await supabase.from("library_files").select("id").eq("user_id", uid).or("file_name.ilike.%zzz%,extracted_text.ilike.%second%");
    expect(orHit.data).toHaveLength(1);
    const miss = await supabase.from("library_files").select("id").eq("user_id", uid).ilike("extracted_text", "%absent%");
    expect(miss.data).toHaveLength(0);
  });
});

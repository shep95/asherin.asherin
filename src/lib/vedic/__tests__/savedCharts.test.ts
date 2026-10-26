import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { supabase } from "@/integrations/supabase/client";

// the save → reopen → remove path the room drives, against the on-device store
describe("vedic_charts on the device store", () => {
  it("saves a named chart without an account, reads it back newest first, and removes it", async () => {
    const row = { name: "test natal", birth_date: "1990-06-15", birth_time: "08:30", tz_offset: 5.5, latitude: 28.6139, longitude: 77.209, city_label: "New Delhi" };
    const first = await supabase.from("vedic_charts").insert(row as never).select("id").single();
    expect(first.error).toBeNull();
    const id = (first.data as { id: string }).id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    await supabase.from("vedic_charts").insert({ ...row, name: "second" } as never);
    const list = await supabase.from("vedic_charts").select("id,name,user_id,created_at").order("created_at", { ascending: false });
    expect(list.error).toBeNull();
    const names = (list.data as { name: string; user_id: string }[]).map((r) => r.name);
    expect(names.slice(0, 2)).toEqual(["second", "test natal"]);
    // the shim scopes every row to the device identity even when the room does not pass one
    expect((list.data as { user_id: string }[]).every((r) => typeof r.user_id === "string" && r.user_id.length > 0)).toBe(true);

    const del = await supabase.from("vedic_charts").delete().eq("id", id);
    expect(del.error).toBeNull();
    const after = await supabase.from("vedic_charts").select("id").eq("id", id);
    expect(after.data).toHaveLength(0);
  });

  it("keeps notes per chart key", async () => {
    await supabase.from("chart_notes").insert({ chart_key: "user:abc", chart_label: "a", note: "jupiter return 2031-04-12", source: "shepherd" } as never);
    await supabase.from("chart_notes").insert({ chart_key: "user:xyz", chart_label: "b", note: "other", source: "shepherd" } as never);
    const mine = await supabase.from("chart_notes").select("note").eq("chart_key", "user:abc");
    expect((mine.data as { note: string }[]).map((n) => n.note)).toEqual(["jupiter return 2031-04-12"]);
  });
});

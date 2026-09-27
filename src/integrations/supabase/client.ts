// asherin local edition: there is no hosted database. Every call that used
// to go to Supabase resolves against this device's own store.
// Import it like this:
//   import { supabase } from "@/integrations/supabase/client";
import { createLocalClient } from "@/lib/local/client";

export const supabase = createLocalClient();
export type { LocalClient } from "@/lib/local/client";

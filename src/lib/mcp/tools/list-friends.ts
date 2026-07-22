import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function clientFor(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_friends",
  title: "List Nova Chat friends",
  description: "List the signed-in user's Nova Chat friends and pending friend requests.",
  inputSchema: {
    status: z
      .enum(["accepted", "pending", "all"])
      .optional()
      .describe("Filter by friendship status. Defaults to 'accepted'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const uid = ctx.getUserId();
    const supabase = clientFor(ctx);
    const filter = status ?? "accepted";
    let q = supabase.from("friends").select("id, sender_id, receiver_id, status, created_at");
    q = q.or(`sender_id.eq.${uid},receiver_id.eq.${uid}`);
    if (filter !== "all") q = q.eq("status", filter);
    const { data: friends, error } = await q.order("created_at", { ascending: false }).limit(100);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const peerIds = Array.from(new Set((friends ?? []).map((f) => (f.sender_id === uid ? f.receiver_id : f.sender_id))));
    const profiles = peerIds.length
      ? (await supabase.from("profiles").select("id, username, display_name, unique_code, avatar_url").in("id", peerIds)).data ?? []
      : [];
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const rows = (friends ?? []).map((f) => {
      const peer = f.sender_id === uid ? f.receiver_id : f.sender_id;
      return { friendship_id: f.id, status: f.status, direction: f.sender_id === uid ? "outgoing" : "incoming", peer: byId.get(peer) ?? { id: peer } };
    });
    return {
      content: [{ type: "text", text: JSON.stringify(rows) }],
      structuredContent: { friends: rows, count: rows.length },
    };
  },
});

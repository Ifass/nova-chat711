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
  name: "list_recent_messages",
  title: "List recent Nova Chat messages",
  description:
    "List recent Nova Chat direct messages for the signed-in user, optionally filtered to messages with a specific peer (by user id, username, or friend code).",
  inputSchema: {
    peer: z.string().trim().min(1).optional().describe("Optional peer identifier: user id (uuid), username, or friend code (e.g. ABC-1234)."),
    limit: z.number().int().min(1).max(200).optional().describe("Max messages to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ peer, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const uid = ctx.getUserId();
    const supabase = clientFor(ctx);

    let peerId: string | null = null;
    if (peer) {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRe.test(peer)) peerId = peer;
      else {
        const { data: p } = await supabase
          .from("profiles")
          .select("id")
          .or(`username.eq.${peer.toLowerCase()},unique_code.eq.${peer.toUpperCase()}`)
          .maybeSingle();
        if (!p) return { content: [{ type: "text", text: `No user matches "${peer}"` }], isError: true };
        peerId = p.id;
      }
    }

    let q = supabase.from("messages").select("id, sender_id, receiver_id, content, created_at, read_at");
    if (peerId) {
      q = q.or(`and(sender_id.eq.${uid},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${uid})`);
    } else {
      q = q.or(`sender_id.eq.${uid},receiver_id.eq.${uid}`);
    }
    const { data, error } = await q.order("created_at", { ascending: false }).limit(limit ?? 50);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { messages: data, count: data?.length ?? 0 },
    };
  },
});

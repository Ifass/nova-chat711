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
  name: "send_message",
  title: "Send a Nova Chat message",
  description: "Send a direct message from the signed-in user to a friend, identified by user id, username, or friend code.",
  inputSchema: {
    to: z.string().trim().min(1).describe("Recipient: user id (uuid), username, or friend code (e.g. ABC-1234)."),
    content: z.string().trim().min(1).max(4000).describe("Message text."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ to, content }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const uid = ctx.getUserId();
    const supabase = clientFor(ctx);

    let receiverId: string;
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRe.test(to)) {
      receiverId = to;
    } else {
      const { data: p, error: pe } = await supabase
        .from("profiles")
        .select("id")
        .or(`username.eq.${to.toLowerCase()},unique_code.eq.${to.toUpperCase()}`)
        .maybeSingle();
      if (pe) return { content: [{ type: "text", text: pe.message }], isError: true };
      if (!p) return { content: [{ type: "text", text: `No user matches "${to}"` }], isError: true };
      receiverId = p.id;
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({ sender_id: uid, receiver_id: receiverId, content })
      .select("id, sender_id, receiver_id, content, created_at")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Message sent (id ${data.id}).` }],
      structuredContent: { message: data },
    };
  },
});

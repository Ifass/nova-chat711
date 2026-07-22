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
  name: "list_calls",
  title: "List Nova Chat call history",
  description: "List recent Nova Chat voice calls for the signed-in user (caller, callee, status, duration, timestamps).",
  inputSchema: {
    limit: z.number().int().min(1).max(200).optional().describe("Max calls to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const uid = ctx.getUserId();
    const supabase = clientFor(ctx);
    const { data, error } = await supabase
      .from("calls")
      .select("id, caller_id, callee_id, status, duration_seconds, started_at, ended_at, ended_reason, created_at")
      .or(`caller_id.eq.${uid},callee_id.eq.${uid}`)
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = (data ?? []).map((c) => ({
      ...c,
      direction: c.caller_id === uid ? "outgoing" : "incoming",
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(rows) }],
      structuredContent: { calls: rows, count: rows.length },
    };
  },
});

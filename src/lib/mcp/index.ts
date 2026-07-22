import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getProfile from "./tools/get-profile";
import listFriends from "./tools/list-friends";
import listRecentMessages from "./tools/list-recent-messages";
import sendMessage from "./tools/send-message";
import listCalls from "./tools/list-calls";

// The OAuth issuer MUST be the direct Supabase host, not the .lovable.cloud
// proxy that SUPABASE_URL is rewritten to on publish. VITE_SUPABASE_PROJECT_ID
// is inlined by Vite at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "nova-chat-mcp",
  title: "Nova Chat",
  version: "0.1.0",
  instructions:
    "Nova Chat MCP server. Tools act as the signed-in Nova Chat user: read the user's profile, list friends, read/send direct messages, and read voice-call history.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getProfile, listFriends, listRecentMessages, sendMessage, listCalls],
});

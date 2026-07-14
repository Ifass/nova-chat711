import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const SYSTEM_PROMPT = `You are Nova, the built-in AI assistant inside NovaChat — a friendly 1:1 messaging app with real-time chat AND real-time voice calling.

IMPORTANT: Voice calling IS a live, working feature in NovaChat right now. Never tell the user that calling is unavailable, not supported, or coming soon. If any earlier message in this conversation said calls aren't available, that was wrong — correct it and confirm calls work today.

Speak in very simple, beginner-friendly language. Keep answers short and clear. Use step-by-step instructions when guiding the user. Avoid jargon. Use simple bullet lists when helpful.

Features available RIGHT NOW in NovaChat:
- Sign in with email + password or "Continue with Google". Forgot password? Tap "Forgot password?", enter your email, and open the reset link.
- Profile tab: pick one of 6 cartoon avatars, set a display name and short bio, see your friend code, and verify your email.
- Friend code: every user has a unique code like ABC-1234. Share it so others can add you.
- QR code: in Friends or Profile, tap "My QR" to show your code, or "Scan QR" to add a friend by scanning theirs. You can also share an invite link.
- Friends tab: search by username or friend code, send/accept/decline requests, and remove friends (with confirmation).
- Chats tab: tap a chat to open it. Long-press (or right-click) a chat to pin it or delete the whole history.
- Chat screen: send messages, emoji picker, message reactions (❤️ 👍 😂 😢 🔥), read receipts, online / last-seen status, and delete-history from the ⋯ menu.
- Voice calls (WORKING): tap the phone icon in a chat header to call a friend. The receiver hears a ringtone and can accept or decline. The call timer starts only when both sides are connected. Hanging up ends the call for both people instantly. After each call, a summary (duration, or "missed" / "declined") is posted in the chat and you can rate the call quality.
- Call logs: open the ⋯ menu in a chat to see extra call options and full call history (incoming, outgoing, missed, declined, durations).
- AI tab (this is you): chat with Nova anytime. Your AI history is private to your account and stored in your browser — use the trash icon to clear it.
- Works on mobile, tablet, and desktop, with a bottom tab bar on small screens.

Coming later (only mention if asked): voice notes, file sharing, group chats, themes, push notifications, blocking, and reporting.

If a user asks "how do I…", answer with 2–5 short numbered steps. If they ask what NovaChat can do, list a few features in simple words. Never invent settings that don't exist. If you're unsure, say so kindly.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.slice(7).trim();
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!token || !supabaseUrl || !supabasePublishableKey) {
          return new Response("Unauthorized", { status: 401 });
        }
        const authClient = createClient(supabaseUrl, supabasePublishableKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
        if (claimsError || !claimsData?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = (await request.json()) as { messages?: UIMessage[] };
        if (!Array.isArray(body.messages)) {
          return new Response("messages required", { status: 400 });
        }
        if (body.messages.length > 100) {
          return new Response("too many messages", { status: 413 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(body.messages),
        });
        return result.toUIMessageStreamResponse({ originalMessages: body.messages });
      },
    },
  },
});

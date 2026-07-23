import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Attachment = {
  path: string;
  size: number;
  width: number;
  height: number;
  mime: string;
};

const SIGN_TTL = 60 * 60; // 1h

async function signPaths(paths: string[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from("chat-images")
    .createSignedUrls(paths, SIGN_TTL);
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => d.signedUrl).filter((u): u is string => !!u);
}

/** Sender creates an image message. Files must already be uploaded under `${userId}/${messageId}/...`. */
export const sendImageRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messageId: string; receiverId: string; attachments: Attachment[]; caption?: string; mode?: "normal" | "request" | "preview_once" }) => {
    if (!d?.messageId || !d?.receiverId) throw new Error("messageId & receiverId required");
    if (!Array.isArray(d.attachments) || d.attachments.length === 0) throw new Error("No attachments");
    if (d.attachments.length > 10) throw new Error("Max 10 images per message");
    if (d.mode && !["normal", "request", "preview_once"].includes(d.mode)) throw new Error("Invalid mode");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.receiverId === userId) throw new Error("Can't send to yourself");
    for (const a of data.attachments) {
      if (!a.path.startsWith(`${userId}/${data.messageId}/`)) throw new Error("Invalid attachment path");
    }
    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    // Simplified permission flow: ALL images require receiver acceptance.
    // "request" is a legacy alias — treat as "normal".
    const rawMode = data.mode ?? "normal";
    const mode = rawMode === "request" ? "normal" : rawMode;
    const needsAction = true;
    const { error } = await supabase.from("messages").insert({
      id: data.messageId,
      sender_id: userId,
      receiver_id: data.receiverId,
      content: data.caption ?? "",
      caption: data.caption ?? null,
      message_type: "image_request",
      attachments: data.attachments as unknown as never,
      image_mode: mode,
      image_request_status: needsAction ? "pending" : "accepted",
      requested_at: now.toISOString(),
      accepted_at: needsAction ? null : now.toISOString(),
      expires_at: expires.toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Receiver accepts / declines / preview-once. Returns signed URLs when accepted/previewed. */
export const respondImageRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messageId: string; action: "accept" | "decline" | "preview" }) => {
    if (!d?.messageId) throw new Error("messageId required");
    if (!["accept", "decline", "preview"].includes(d.action)) throw new Error("Invalid action");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: msg, error: fe } = await supabase
      .from("messages")
      .select("id, sender_id, receiver_id, message_type, image_request_status, attachments, expires_at")
      .eq("id", data.messageId)
      .maybeSingle();
    if (fe) throw new Error(fe.message);
    if (!msg) throw new Error("Message not found");
    if (msg.receiver_id !== userId) throw new Error("Not the recipient");
    if (msg.message_type !== "image_request") throw new Error("Not an image request");
    if (msg.image_request_status && !["pending", "previewed"].includes(msg.image_request_status)) {
      // Idempotent: allow re-fetch only if already accepted
      if (msg.image_request_status === "accepted" && data.action === "accept") {
        const urls = await signPaths(((msg.attachments as unknown) as Attachment[]).map((a) => a.path));
        return { status: "accepted" as const, urls };
      }
      throw new Error(`Request already ${msg.image_request_status}`);
    }
    if (msg.expires_at && new Date(msg.expires_at) < new Date()) {
      await supabase.from("messages").update({ image_request_status: "expired" }).eq("id", msg.id);
      throw new Error("Request expired");
    }
    const now = new Date().toISOString();
    if (data.action === "decline") {
      const { error } = await supabase
        .from("messages")
        .update({ image_request_status: "declined", declined_at: now })
        .eq("id", msg.id);
      if (error) throw new Error(error.message);
      return { status: "declined" as const };
    }
    const urls = await signPaths(((msg.attachments as unknown) as Attachment[]).map((a) => a.path));
    if (data.action === "accept") {
      const { error } = await supabase
        .from("messages")
        .update({ image_request_status: "accepted", accepted_at: now })
        .eq("id", msg.id);
      if (error) throw new Error(error.message);
      return { status: "accepted" as const, urls };
    }
    // preview
    const { error } = await supabase
      .from("messages")
      .update({ image_request_status: "previewed", previewed_at: now })
      .eq("id", msg.id);
    if (error) throw new Error(error.message);
    return { status: "previewed" as const, urls };
  });

/** Get signed URLs for a message the caller already has access to (sender always; receiver only if accepted). */
export const getImageUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messageId: string }) => {
    if (!d?.messageId) throw new Error("messageId required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: msg, error } = await supabase
      .from("messages")
      .select("id, sender_id, receiver_id, image_request_status, attachments")
      .eq("id", data.messageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!msg) throw new Error("Message not found");
    const isSender = msg.sender_id === userId;
    const isReceiver = msg.receiver_id === userId;
    if (!isSender && !isReceiver) throw new Error("Forbidden");
    if (!isSender && msg.image_request_status !== "accepted") throw new Error("Not accepted");
    const urls = await signPaths(((msg.attachments as unknown) as Attachment[]).map((a) => a.path));
    return { urls };
  });

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function mintToken(identity: string, name: string, room: string) {
  const { AccessToken } = await import("livekit-server-sdk");
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) throw new Error("Voice calling isn't configured");
  const at = new AccessToken(apiKey, apiSecret, { identity, name, ttl: 60 * 30 });
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });
  const token = await at.toJwt();
  return { token, url };
}

export const startCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { calleeId: string }) => {
    if (!d?.calleeId) throw new Error("calleeId required");
    return { calleeId: d.calleeId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.calleeId === userId) throw new Error("Can't call yourself");

    const roomName = `nova-${crypto.randomUUID()}`;
    const { data: call, error } = await supabase
      .from("calls")
      .insert({ caller_id: userId, callee_id: data.calleeId, room_name: roomName, status: "ringing" })
      .select("id, room_name").single();
    if (error || !call) throw new Error(error?.message ?? "Failed to start call");

    const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
    const tok = await mintToken(userId, prof?.display_name ?? "User", call.room_name);
    return { callId: call.id, roomName: call.room_name, token: tok.token, url: tok.url };
  });

export const getCallToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { callId: string }) => {
    if (!d?.callId) throw new Error("callId required");
    return { callId: d.callId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: call, error } = await supabase.from("calls")
      .select("id, caller_id, callee_id, room_name, status").eq("id", data.callId).maybeSingle();
    if (error || !call) throw new Error("Call not found");
    if (call.caller_id !== userId && call.callee_id !== userId) throw new Error("Not a participant");
    const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
    const tok = await mintToken(userId, prof?.display_name ?? "User", call.room_name);
    return { roomName: call.room_name, token: tok.token, url: tok.url };
  });

export const updateCallStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { callId: string; status: "accepted" | "ended" | "missed" | "declined"; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: call } = await supabase.from("calls")
      .select("id, caller_id, callee_id, started_at, status").eq("id", data.callId).maybeSingle();
    if (!call) throw new Error("Call not found");
    if (call.caller_id !== userId && call.callee_id !== userId) throw new Error("Not a participant");

    const isTerminal = data.status === "ended" || data.status === "missed" || data.status === "declined";
    const wasTerminal = call.status === "ended" || call.status === "missed" || call.status === "declined";

    const patch: {
      status: string; updated_at: string;
      started_at?: string; ended_at?: string; ended_reason?: string; duration_seconds?: number;
    } = { status: data.status, updated_at: new Date().toISOString() };
    if (data.status === "accepted" && !call.started_at) patch.started_at = new Date().toISOString();
    let durationSeconds = 0;
    if (isTerminal) {
      const endedAt = new Date();
      patch.ended_at = endedAt.toISOString();
      patch.ended_reason = data.reason ?? data.status;
      if (call.started_at) {
        durationSeconds = Math.max(0, Math.floor((endedAt.getTime() - new Date(call.started_at).getTime()) / 1000));
        patch.duration_seconds = durationSeconds;
      }
    }
    const { error } = await supabase.from("calls").update(patch).eq("id", data.callId);
    if (error) throw new Error(error.message);

    // Insert a call-log system message once per call, visible to both sides.
    if (isTerminal && !wasTerminal) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const payload = {
        kind: "call" as const,
        status: data.status,
        reason: data.reason ?? data.status,
        duration: durationSeconds,
        caller_id: call.caller_id,
        callee_id: call.callee_id,
        call_id: call.id,
      };
      await supabaseAdmin.from("messages").insert({
        sender_id: call.caller_id,
        receiver_id: call.callee_id,
        content: `[[novacall]]${JSON.stringify(payload)}`,
      });
    }
    return { ok: true };
  });

export const rateCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { callId: string; stars: number; feedback?: string }) => {
    if (!d?.callId) throw new Error("callId required");
    if (d.stars < 1 || d.stars > 5) throw new Error("stars must be 1-5");
    return { callId: d.callId, stars: d.stars, feedback: d.feedback?.slice(0, 500) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("call_ratings").insert({
      call_id: data.callId, user_id: userId, stars: data.stars, feedback: data.feedback ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

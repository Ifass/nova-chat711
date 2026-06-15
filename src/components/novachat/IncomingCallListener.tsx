import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getCallToken, updateCallStatus } from "@/lib/call.functions";
import { VoiceCall } from "@/components/novachat/VoiceCall";
import type { ProfileLite } from "@/lib/novachat-types";
import { toast } from "sonner";

type ActiveCall = {
  callId: string;
  token: string;
  url: string;
  peer: ProfileLite;
  role: "caller" | "callee";
  initialStatus: "ringing" | "accepted";
};

let activeOpener: ((c: ActiveCall) => void) | null = null;
export function openVoiceCall(c: ActiveCall) { activeOpener?.(c); }

export function IncomingCallListener({ meId }: { meId: string }) {
  const fetchToken = useServerFn(getCallToken);
  const updStatus = useServerFn(updateCallStatus);
  const [active, setActive] = useState<ActiveCall | null>(null);

  useEffect(() => { activeOpener = (c) => setActive(c); return () => { activeOpener = null; }; }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`incoming-calls-${meId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "calls", filter: `callee_id=eq.${meId}` },
        async (payload) => {
          const c = payload.new as { id: string; caller_id: string; status: string };
          if (c.status !== "ringing") return;
          if (active) return;
          // fetch caller profile
          const { data: peer } = await supabase.from("profiles")
            .select("id, username, display_name, unique_code, avatar_url, bio")
            .eq("id", c.caller_id).maybeSingle();
          if (!peer) return;
          try {
            const t = await fetchToken({ data: { callId: c.id } });
            setActive({
              callId: c.id, token: t.token, url: t.url, peer: peer as ProfileLite,
              role: "callee", initialStatus: "ringing",
            });
            // auto-miss after 30s if still ringing
            setTimeout(async () => {
              setActive((cur) => {
                if (cur?.callId === c.id) {
                  updStatus({ data: { callId: c.id, status: "missed" } }).catch(() => {});
                  toast.message(`Missed call from ${peer.display_name}`);
                  return null;
                }
                return cur;
              });
            }, 30_000);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to load incoming call");
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [meId, fetchToken, updStatus, active]);

  if (!active) return null;
  return (
    <VoiceCall
      callId={active.callId}
      token={active.token}
      url={active.url}
      peer={active.peer}
      role={active.role}
      initialStatus={active.initialStatus}
      onClose={() => setActive(null)}
    />
  );
}

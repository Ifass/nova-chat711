import { useEffect, useMemo, useState } from "react";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { initials, formatTime, type ProfileLite } from "@/lib/novachat-types";

type CallRow = {
  id: string;
  caller_id: string;
  callee_id: string;
  status: string;
  duration_seconds: number | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
};

type CallEntry = {
  call: CallRow;
  peer: ProfileLite;
  direction: "incoming" | "outgoing";
};

function formatDuration(s: number | null) {
  if (!s || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function statusMeta(direction: "incoming" | "outgoing", status: string) {
  if (status === "missed") return { label: "Missed", Icon: PhoneMissed, tone: "text-destructive" };
  if (status === "declined") return { label: direction === "outgoing" ? "Declined" : "Rejected", Icon: PhoneOff, tone: "text-destructive" };
  if (status === "ended" || status === "accepted") {
    return direction === "incoming"
      ? { label: "Incoming", Icon: PhoneIncoming, tone: "text-emerald-500" }
      : { label: "Outgoing", Icon: PhoneOutgoing, tone: "text-primary" };
  }
  if (status === "ringing") {
    return direction === "outgoing"
      ? { label: "Cancelled", Icon: PhoneOff, tone: "text-muted-foreground" }
      : { label: "Missed", Icon: PhoneMissed, tone: "text-destructive" };
  }
  return { label: status, Icon: Phone, tone: "text-muted-foreground" };
}

export function CallsTab({
  me,
  onOpenChat,
}: {
  me: ProfileLite;
  onOpenChat: (peer: ProfileLite) => void;
}) {
  const [entries, setEntries] = useState<CallEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = async () => {
    const { data: calls } = await supabase
      .from("calls")
      .select("id, caller_id, callee_id, status, duration_seconds, created_at, started_at, ended_at")
      .or(`caller_id.eq.${me.id},callee_id.eq.${me.id}`)
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = (calls ?? []) as CallRow[];
    const peerIds = Array.from(new Set(rows.map((c) => (c.caller_id === me.id ? c.callee_id : c.caller_id))));
    if (peerIds.length === 0) { setEntries([]); setLoading(false); return; }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, unique_code, avatar_url")
      .in("id", peerIds);
    const map = new Map((profiles ?? []).map((p) => [p.id, p as ProfileLite]));
    const built: CallEntry[] = rows
      .map((c) => {
        const peerId = c.caller_id === me.id ? c.callee_id : c.caller_id;
        const peer = map.get(peerId);
        if (!peer) return null;
        return { call: c, peer, direction: c.caller_id === me.id ? "outgoing" : "incoming" } as CallEntry;
      })
      .filter((x): x is CallEntry => x !== null);
    setEntries(built);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`calls-history-${me.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      e.peer.display_name.toLowerCase().includes(q) ||
      e.peer.username.toLowerCase().includes(q) ||
      e.peer.unique_code.toLowerCase().includes(q)
    );
  }, [entries, query]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search call history"
            className="pl-9 h-9"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {query ? "No calls match your search." : "No calls yet. Voice-call a friend to see history here."}
          </div>
        ) : (
          <ul>
            {filtered.map((e) => {
              const meta = statusMeta(e.direction, e.call.status);
              return (
                <li key={e.call.id}>
                  <button
                    onClick={() => onOpenChat(e.peer)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 text-left border-b border-border/50"
                  >
                    <Avatar className="size-11">
                      <AvatarImage src={e.peer.avatar_url ?? undefined} alt={e.peer.display_name} />
                      <AvatarFallback className="bg-primary/15 text-primary text-sm font-medium">
                        {initials(e.peer.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className={cn("font-medium truncate", meta.tone === "text-destructive" && "text-destructive")}>
                          {e.peer.display_name}
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0">{formatTime(e.call.created_at)}</div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <meta.Icon className={cn("size-3.5", meta.tone)} />
                        <span>{meta.label}</span>
                        <span>·</span>
                        <span>Voice</span>
                        <span>·</span>
                        <span>{formatDuration(e.call.duration_seconds)}</span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

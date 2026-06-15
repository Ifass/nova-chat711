import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials, formatTime, type ProfileLite, type MessageRow } from "@/lib/novachat-types";

type ChatPreview = {
  peer: ProfileLite;
  last: MessageRow | null;
  unread: number;
};

export function ChatsTab({
  me,
  online,
  activePeerId,
  onOpen,
}: {
  me: ProfileLite;
  online: Set<string>;
  activePeerId?: string;
  onOpen: (peer: ProfileLite) => void;
}) {
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    // Get accepted friends
    const { data: friends } = await supabase
      .from("friends")
      .select("sender_id, receiver_id, status")
      .eq("status", "accepted");
    const peerIds = (friends ?? [])
      .map((f) => (f.sender_id === me.id ? f.receiver_id : f.sender_id))
      .filter((id) => id !== me.id);
    if (peerIds.length === 0) {
      setChats([]);
      setLoading(false);
      return;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, unique_code, avatar_url")
      .in("id", peerIds);
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, sender_id, receiver_id, content, read_at, created_at")
      .or(
        peerIds
          .map(
            (pid) =>
              `and(sender_id.eq.${me.id},receiver_id.eq.${pid}),and(sender_id.eq.${pid},receiver_id.eq.${me.id})`
          )
          .join(",")
      )
      .order("created_at", { ascending: false })
      .limit(500);

    const previews: ChatPreview[] = (profiles ?? []).map((p) => {
      const conv = (msgs ?? []).filter(
        (m) =>
          (m.sender_id === p.id && m.receiver_id === me.id) ||
          (m.sender_id === me.id && m.receiver_id === p.id)
      );
      const last = conv[0] ?? null;
      const unread = conv.filter((m) => m.sender_id === p.id && !m.read_at).length;
      return { peer: p as ProfileLite, last, unread };
    });
    previews.sort((a, b) => {
      const ta = a.last ? new Date(a.last.created_at).getTime() : 0;
      const tb = b.last ? new Date(b.last.created_at).getTime() : 0;
      return tb - ta;
    });
    setChats(previews);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("chats-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friends" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading chats…</div>;
  }
  if (chats.length === 0) {
    return (
      <div className="p-6 text-sm text-muted-foreground text-center">
        No chats yet. Add a friend to start messaging.
      </div>
    );
  }
  return (
    <div className="overflow-y-auto h-full">
      {chats.map((c) => (
        <button
          key={c.peer.id}
          onClick={() => onOpen(c.peer)}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/60 transition-colors text-left border-b border-border/50",
            activePeerId === c.peer.id && "bg-accent/80"
          )}
        >
          <div className="relative">
            <Avatar className="size-12">
              <AvatarImage src={c.peer.avatar_url ?? undefined} />
              <AvatarFallback className="bg-primary/15 text-primary">
                {initials(c.peer.display_name)}
              </AvatarFallback>
            </Avatar>
            {online.has(c.peer.id) && (
              <span className="absolute bottom-0 right-0 size-3 rounded-full bg-online border-2 border-card" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-medium truncate">{c.peer.display_name}</div>
              {c.last && (
                <div className="text-[11px] text-muted-foreground shrink-0">
                  {formatTime(c.last.created_at)}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground truncate">
                {c.last
                  ? (c.last.sender_id === me.id ? "You: " : "") + c.last.content
                  : `@${c.peer.username}`}
              </div>
              {c.unread > 0 && (
                <span className="bg-primary text-primary-foreground rounded-full min-w-5 h-5 px-1.5 text-[11px] font-semibold grid place-items-center">
                  {c.unread}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Pin, PinOff, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { initials, formatTime, type ProfileLite, type MessageRow } from "@/lib/novachat-types";
import { toast } from "sonner";

type ChatPreview = { peer: ProfileLite; last: MessageRow | null; unread: number; pinned: boolean };

export function ChatsTab({
  me, online, activePeerId, onOpen,
}: {
  me: ProfileLite;
  online: Set<string>;
  activePeerId?: string;
  onOpen: (peer: ProfileLite) => void;
}) {
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<ProfileLite | null>(null);

  const load = async () => {
    const [{ data: friends }, { data: pins }] = await Promise.all([
      supabase.from("friends").select("sender_id, receiver_id, status").eq("status", "accepted"),
      supabase.from("pinned_chats").select("peer_id").eq("user_id", me.id),
    ]);
    const pinnedSet = new Set((pins ?? []).map((p) => p.peer_id));
    const peerIds = (friends ?? [])
      .map((f) => (f.sender_id === me.id ? f.receiver_id : f.sender_id))
      .filter((id) => id !== me.id);
    if (peerIds.length === 0) { setChats([]); setLoading(false); return; }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, unique_code, avatar_url")
      .in("id", peerIds);
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, sender_id, receiver_id, content, read_at, created_at")
      .or(peerIds.map((pid) => `and(sender_id.eq.${me.id},receiver_id.eq.${pid}),and(sender_id.eq.${pid},receiver_id.eq.${me.id})`).join(","))
      .order("created_at", { ascending: false })
      .limit(500);

    const previews: ChatPreview[] = (profiles ?? []).map((p) => {
      const conv = (msgs ?? []).filter(
        (m) => (m.sender_id === p.id && m.receiver_id === me.id) || (m.sender_id === me.id && m.receiver_id === p.id)
      );
      const last = conv[0] ?? null;
      const unread = conv.filter((m) => m.sender_id === p.id && !m.read_at).length;
      return { peer: p as ProfileLite, last, unread, pinned: pinnedSet.has(p.id) };
    });
    previews.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
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
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "friends" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "pinned_chats" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);

  const togglePin = async (c: ChatPreview) => {
    if (c.pinned) {
      const { error } = await supabase.from("pinned_chats").delete().eq("user_id", me.id).eq("peer_id", c.peer.id);
      if (error) toast.error(error.message); else toast.success("Unpinned");
    } else {
      const { error } = await supabase.from("pinned_chats").insert({ user_id: me.id, peer_id: c.peer.id });
      if (error) toast.error(error.message); else toast.success("Pinned to top");
    }
  };

  const deleteHistory = async (peer: ProfileLite) => {
    const { error } = await supabase
      .from("messages")
      .delete()
      .or(`and(sender_id.eq.${me.id},receiver_id.eq.${peer.id}),and(sender_id.eq.${peer.id},receiver_id.eq.${me.id})`);
    if (error) toast.error(error.message);
    else { toast.success("Chat history deleted"); load(); }
    setConfirmDelete(null);
  };

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Loading chats…</div>;
  if (chats.length === 0) {
    return (
      <div className="p-6 text-sm text-muted-foreground text-center">
        No chats yet. Add a friend to start messaging.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-y-auto h-full">
        {chats.map((c) => (
          <ContextMenu key={c.peer.id}>
            <ContextMenuTrigger asChild>
              <button
                onClick={() => onOpen(c.peer)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/60 transition-colors text-left border-b border-border/50",
                  activePeerId === c.peer.id && "bg-accent/80"
                )}
              >
                <div className="relative">
                  <Avatar className="size-12">
                    <AvatarImage src={c.peer.avatar_url ?? undefined} alt={c.peer.display_name} />
                    <AvatarFallback className="bg-primary/15 text-primary">{initials(c.peer.display_name)}</AvatarFallback>
                  </Avatar>
                  {online.has(c.peer.id) && <span className="absolute bottom-0 right-0 size-3 rounded-full bg-online border-2 border-card" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-medium truncate flex items-center gap-1.5">
                      {c.pinned && <Pin className="size-3 text-primary shrink-0" />}
                      {c.peer.display_name}
                    </div>
                    {c.last && <div className="text-[11px] text-muted-foreground shrink-0">{formatTime(c.last.created_at)}</div>}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-muted-foreground truncate">
                      {c.last ? (c.last.sender_id === me.id ? "You: " : "") + c.last.content : `@${c.peer.username}`}
                    </div>
                    {c.unread > 0 && (
                      <span className="bg-primary text-primary-foreground rounded-full min-w-5 h-5 px-1.5 text-[11px] font-semibold grid place-items-center">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => togglePin(c)}>
                {c.pinned ? <><PinOff className="size-4 mr-2" />Unpin chat</> : <><Pin className="size-4 mr-2" />Pin to top</>}
              </ContextMenuItem>
              <ContextMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDelete(c.peer)}>
                <Trash2 className="size-4 mr-2" />Delete chat history
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat history?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes all messages between you and{" "}
              <span className="font-semibold">{confirmDelete?.display_name}</span> for both of you. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && deleteHistory(confirmDelete)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Used elsewhere — keep Button reference to avoid unused-import warnings.
void Button;

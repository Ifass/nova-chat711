import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Check, CheckCheck, Smile, MoreVertical, Trash2 } from "lucide-react";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { initials, formatTime, REACTION_EMOJIS, type ProfileLite, type MessageRow, type ReactionRow } from "@/lib/novachat-types";

export function ChatView({
  me, peer, online, onBack,
}: {
  me: ProfileLite;
  peer: ProfileLite;
  online: boolean;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const broadcastRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const conversationKey = [me.id, peer.id].sort().join(":");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, sender_id, receiver_id, content, read_at, created_at")
        .or(`and(sender_id.eq.${me.id},receiver_id.eq.${peer.id}),and(sender_id.eq.${peer.id},receiver_id.eq.${me.id})`)
        .order("created_at", { ascending: true })
        .limit(500);
      if (cancelled) return;
      const msgs = (data ?? []) as MessageRow[];
      setMessages(msgs);
      if (msgs.length) {
        const { data: rx } = await supabase
          .from("message_reactions")
          .select("id, message_id, user_id, emoji")
          .in("message_id", msgs.map((m) => m.id));
        if (!cancelled) setReactions((rx ?? []) as ReactionRow[]);
      } else setReactions([]);
      await supabase.from("messages").update({ read_at: new Date().toISOString() })
        .eq("sender_id", peer.id).eq("receiver_id", me.id).is("read_at", null);
    };
    load();

    const dbChannel = supabase
      .channel(`conv-db-${conversationKey}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as MessageRow;
        const involvesPair = (m.sender_id === me.id && m.receiver_id === peer.id) || (m.sender_id === peer.id && m.receiver_id === me.id);
        if (!involvesPair) return;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        if (m.sender_id === peer.id) {
          supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id).then(() => {});
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as MessageRow;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const m = payload.old as MessageRow;
        setMessages((prev) => prev.filter((x) => x.id !== m.id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, (payload) => {
        const r = payload.new as ReactionRow;
        setReactions((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r]));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, (payload) => {
        const r = payload.old as ReactionRow;
        setReactions((prev) => prev.filter((x) => x.id !== r.id));
      })
      .subscribe();

    const broadcast = supabase
      .channel(`conv-bcast-${conversationKey}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, (payload) => {
        if ((payload.payload as { from?: string })?.from === peer.id) {
          setPeerTyping(true);
          if (typingTimeout.current) clearTimeout(typingTimeout.current);
          typingTimeout.current = setTimeout(() => setPeerTyping(false), 2500);
        }
      })
      .subscribe();
    broadcastRef.current = broadcast;

    return () => {
      cancelled = true;
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(broadcast);
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
    };
  }, [me.id, peer.id, conversationKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, peerTyping, reactions]);

  const handleInput = (v: string) => {
    setInput(v);
    if (broadcastRef.current && v.length > 0) {
      broadcastRef.current.send({ type: "broadcast", event: "typing", payload: { from: me.id } });
    }
  };

  const insertEmoji = (em: string) => {
    setInput((v) => v + em);
    setEmojiOpen(false);
    inputRef.current?.focus();
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");
    const { error } = await supabase.from("messages").insert({ sender_id: me.id, receiver_id: peer.id, content });
    setSending(false);
    if (error) { toast.error(error.message); setInput(content); }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    const existing = reactions.find((r) => r.message_id === messageId && r.user_id === me.id && r.emoji === emoji);
    if (existing) {
      const { error } = await supabase.from("message_reactions").delete().eq("id", existing.id);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase.from("message_reactions").insert({ message_id: messageId, user_id: me.id, emoji });
      if (error) toast.error(error.message);
    }
  };

  const clearHistory = async () => {
    const { error } = await supabase
      .from("messages")
      .delete()
      .or(`and(sender_id.eq.${me.id},receiver_id.eq.${peer.id}),and(sender_id.eq.${peer.id},receiver_id.eq.${me.id})`);
    if (error) toast.error(error.message); else { toast.success("Chat history deleted"); setMessages([]); setReactions([]); }
    setConfirmClear(false);
  };

  // group reactions per message+emoji
  const reactionsByMsg = new Map<string, Map<string, { count: number; mine: boolean }>>();
  for (const r of reactions) {
    if (!reactionsByMsg.has(r.message_id)) reactionsByMsg.set(r.message_id, new Map());
    const map = reactionsByMsg.get(r.message_id)!;
    const cur = map.get(r.emoji) ?? { count: 0, mine: false };
    map.set(r.emoji, { count: cur.count + 1, mine: cur.mine || r.user_id === me.id });
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-16 px-3 sm:px-4 flex items-center gap-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="relative">
          <Avatar className="size-10">
            <AvatarImage src={peer.avatar_url ?? undefined} alt={peer.display_name} />
            <AvatarFallback className="bg-primary/15 text-primary">{initials(peer.display_name)}</AvatarFallback>
          </Avatar>
          {online && <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-online border-2 border-card" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{peer.display_name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {peerTyping ? "typing…" : online ? "online" : `@${peer.username}`}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More"><MoreVertical className="size-5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmClear(true)}>
              <Trash2 className="size-4 mr-2" /> Delete chat history
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto chat-pattern p-3 sm:p-4">
        <div className="max-w-3xl mx-auto space-y-1.5">
          {messages.map((m, i) => {
            const mine = m.sender_id === me.id;
            const prev = messages[i - 1];
            const tail = !prev || prev.sender_id !== m.sender_id;
            const rx = reactionsByMsg.get(m.id);
            return (
              <div key={m.id} className={`flex group ${mine ? "justify-end" : "justify-start"}`}>
                <div className="flex flex-col items-stretch max-w-[80%] sm:max-w-[65%]">
                  <div className={`flex items-center gap-1 ${mine ? "flex-row-reverse" : ""}`}>
                    <div className={`px-3 py-2 text-sm shadow-sm ${
                      mine
                        ? `bg-bubble-me text-bubble-me-foreground rounded-2xl ${tail ? "rounded-br-md" : ""}`
                        : `bg-bubble-other text-bubble-other-foreground rounded-2xl ${tail ? "rounded-bl-md" : ""}`
                    }`}>
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                      <div className={`flex items-center gap-1 justify-end mt-0.5 text-[10px] ${mine ? "text-bubble-me-foreground/70" : "text-muted-foreground"}`}>
                        <span>{formatTime(m.created_at)}</span>
                        {mine && (m.read_at ? <CheckCheck className="size-3 text-primary" /> : <Check className="size-3" />)}
                      </div>
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button aria-label="React" className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-foreground">
                          <Smile className="size-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-1" side="top">
                        <div className="flex gap-1">
                          {REACTION_EMOJIS.map((e) => (
                            <button key={e} onClick={() => toggleReaction(m.id, e)} className="text-xl hover:scale-125 transition-transform p-1">
                              {e}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  {rx && rx.size > 0 && (
                    <div className={`flex gap-1 mt-1 flex-wrap ${mine ? "justify-end" : "justify-start"}`}>
                      {Array.from(rx.entries()).map(([emoji, info]) => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(m.id, emoji)}
                          className={`text-xs px-1.5 py-0.5 rounded-full border ${
                            info.mine ? "bg-primary/15 border-primary/40" : "bg-card border-border"
                          }`}
                        >
                          {emoji} {info.count}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {peerTyping && (
            <div className="flex justify-start">
              <div className="bg-bubble-other rounded-2xl rounded-bl-md px-4 py-3 shadow-sm flex gap-1">
                <span className="typing-dot size-2 rounded-full bg-muted-foreground" />
                <span className="typing-dot size-2 rounded-full bg-muted-foreground" />
                <span className="typing-dot size-2 rounded-full bg-muted-foreground" />
              </div>
            </div>
          )}
          {messages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">
              Say hi to {peer.display_name} 👋
            </div>
          )}
        </div>
      </div>

      <form onSubmit={send} className="p-3 border-t border-border bg-card">
        <div className="max-w-3xl mx-auto flex gap-2 items-center">
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Emoji picker"><Smile className="size-5" /></Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 border-0" side="top" align="start">
              <EmojiPicker
                onEmojiClick={(d) => insertEmoji(d.emoji)}
                emojiStyle={EmojiStyle.NATIVE}
                theme={Theme.AUTO}
                width={320}
                height={400}
                lazyLoadEmojis
              />
            </PopoverContent>
          </Popover>
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Type a message"
            autoFocus
          />
          <Button type="submit" size="icon" disabled={!input.trim() || sending} aria-label="Send message">
            <Send className="size-4" />
          </Button>
        </div>
      </form>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat history?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes all messages between you and{" "}
              <span className="font-semibold">{peer.display_name}</span> for both of you. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={clearHistory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

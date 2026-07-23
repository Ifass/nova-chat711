import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Check, CheckCheck, Smile, MoreVertical, Trash2, Phone, PhoneOff, PhoneMissed, PhoneIncoming, PhoneOutgoing, ImagePlus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { startCall } from "@/lib/call.functions";
import { sendImageRequest } from "@/lib/image.functions";
import { openVoiceCall } from "@/components/novachat/IncomingCallListener";
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
import { cn } from "@/lib/utils";
import { makePlaceholder, decodePreview, compressInBackground, validateFile, extForMime, ACCEPTED_TYPES, MAX_COUNT, type PreparedImage } from "@/lib/image-utils";
import { ImagePreviewModal } from "@/components/novachat/ImagePreviewModal";
import { ImageMessage } from "@/components/novachat/ImageMessage";
import { ChatImageViewer, type GalleryItem } from "@/components/novachat/ChatImageViewer";
import { getImageUrls } from "@/lib/image.functions";

const CALL_MSG_PREFIX = "[[novacall]]";
type CallLogPayload = {
  kind: "call";
  status: "ended" | "missed" | "declined";
  reason: string;
  duration: number;
  caller_id: string;
  callee_id: string;
  call_id: string;
};
function parseCallLog(content: string): CallLogPayload | null {
  if (!content.startsWith(CALL_MSG_PREFIX)) return null;
  try {
    const p = JSON.parse(content.slice(CALL_MSG_PREFIX.length)) as CallLogPayload;
    return p.kind === "call" ? p : null;
  } catch { return null; }
}
function fmtDuration(s: number) {
  if (s <= 0) return "0s";
  const m = Math.floor(s / 60), sec = s % 60;
  if (m === 0) return `${sec}s`;
  return `${m}m ${sec.toString().padStart(2, "0")}s`;
}


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
  const [calling, setCalling] = useState(false);
  const startCallFn = useServerFn(startCall);
  const sendImageFn = useServerFn(sendImageRequest);
  const getImageUrlsFn = useServerFn(getImageUrls);
  const [peerTyping, setPeerTyping] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // Two INDEPENDENT viewers — normal gallery and preview-once — never share state.
  const [normalOpenKey, setNormalOpenKey] = useState<string | null>(null);
  const [previewOnce, setPreviewOnce] = useState<{ msgId: string; urls: string[] } | null>(null);
  const [thumbCache, setThumbCache] = useState<Record<string, string[]>>({});
  const urlPromises = useRef<Map<string, Promise<string[]>>>(new Map());
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pending, setPending] = useState<PreparedImage[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const broadcastRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const conversationKey = [me.id, peer.id].sort().join(":");

  useEffect(() => {
    let cancelled = false;
    console.log("[RT] mount ChatView, conversationKey=", conversationKey, "me=", me.id, "peer=", peer.id);
    const load = async () => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      console.log("[RT] auth token present?", !!token, "len=", token?.length ?? 0);
      if (token) {
        try {
          await supabase.realtime.setAuth(token);
          console.log("[RT] supabase.realtime.setAuth() OK");
        } catch (e) { console.warn("[RT] setAuth failed", e); }
      } else {
        console.warn("[RT] NO ACCESS TOKEN — realtime will be anon; RLS-filtered events will drop");
      }
      const { data } = await supabase
        .from("messages")
        .select("id, sender_id, receiver_id, content, read_at, created_at, message_type, attachments, caption, image_mode, image_request_status, expires_at")
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

    console.log("[RT] creating channel conv-db-" + conversationKey);
    const dbChannel = supabase
      .channel(`conv-db-${conversationKey}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as MessageRow;
        console.log("[RT] INSERT recv", { id: m.id, sender: m.sender_id, receiver: m.receiver_id, type: m.message_type, mode: m.image_mode });
        const involvesPair = (m.sender_id === me.id && m.receiver_id === peer.id) || (m.sender_id === peer.id && m.receiver_id === me.id);
        if (!involvesPair) { console.log("[RT] INSERT ignored — not this pair", { me: me.id, peer: peer.id }); return; }
        setMessages((prev) => {
          if (prev.some((x) => x.id === m.id)) { console.log("[RT] INSERT dedup", m.id, "count", prev.length); return prev; }
          console.log("[RT] append", m.id, "count", prev.length, "->", prev.length + 1);
          return [...prev, m];
        });
        if (m.sender_id === peer.id) {
          supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id).then(() => {});
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as MessageRow;
        console.log("[RT] UPDATE recv", m.id, "status=", m.image_request_status);
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
      .subscribe((status, err) => {
        console.log("[RT] dbChannel status=", status, err ?? "");
      });

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
      console.log("[RT] cleanup — removeChannel for", conversationKey);
      cancelled = true;
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(broadcast);
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
    };
  }, [me.id, peer.id, conversationKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, peerTyping, reactions]);

  // Preload thumbnail URLs for image messages the user can view.
  useEffect(() => {
    for (const m of messages) {
      if (m.message_type !== "image_request") continue;
      const mineMsg = m.sender_id === me.id;
      const status = m.image_request_status ?? "pending";
      if (!(mineMsg || status === "accepted")) continue;
      if (thumbCache[m.id] || urlPromises.current.has(m.id)) continue;
      const p = getImageUrlsFn({ data: { messageId: m.id } })
        .then((r) => {
          setThumbCache((c) => ({ ...c, [m.id]: r.urls }));
          return r.urls;
        })
        .catch((e) => { urlPromises.current.delete(m.id); throw e; });
      urlPromises.current.set(m.id, p);
      p.catch(() => {}); // swallow; grid will just show placeholder
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);


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

  // Track per-image background processing so Send can await pending compression.
  const processingRef = useRef<Map<string, Promise<void>>>(new Map());

  const processItem = (item: PreparedImage) => {
    const p = (async () => {
      // Kick off decode + compression in parallel; both mutate state independently.
      const decode = decodePreview(item).then((patch) => {
        setPending((cur) => cur.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
      });
      // Mark compressing immediately so the modal can show "Compressing…"
      setPending((cur) => cur.map((x) => (x.id === item.id ? { ...x, compressing: true } : x)));
      const compress = compressInBackground(item).then((patch) => {
        setPending((cur) => cur.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
      });
      await Promise.all([decode, compress]);
    })();
    processingRef.current.set(item.id, p);
    p.finally(() => processingRef.current.delete(item.id));
  };

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    // Instant modal — no awaits before this point.
    const room = MAX_COUNT - pending.length;
    if (room <= 0) { toast.error(`Max ${MAX_COUNT} images per message`); return; }
    const accepted: File[] = [];
    for (const f of arr) {
      if (accepted.length >= room) { toast.error(`Only added the first ${room} image${room === 1 ? "" : "s"}`); break; }
      const err = validateFile(f);
      if (err) { toast.error(err); continue; }
      accepted.push(f);
    }
    if (accepted.length === 0) return;
    const placeholders = accepted.map(makePlaceholder);
    setPending((p) => [...p, ...placeholders]);
    setPickerOpen(true);
    // Fire-and-forget background processing (parallel per image).
    for (const item of placeholders) processItem(item);
  };

  const sendImages = async (caption: string, mode: "normal" | "preview_once" = "normal") => {
    if (pending.length === 0) return;
    setUploading(true);
    setUploadPct(0);
    // Wait for any in-flight decode/compression so we upload the optimized files.
    await Promise.all(Array.from(processingRef.current.values()));
    const items = pending.filter((p) => p.status !== "error");
    if (items.length === 0) {
      setUploading(false);
      toast.error("No valid images to send");
      return;
    }
    const messageId = crypto.randomUUID();
    console.log("[SEND] begin, messageId=", messageId, "mode=", mode, "count=", items.length);
    const uploaded: { path: string; size: number; width: number; height: number; mime: string }[] = [];
    try {
      for (let i = 0; i < items.length; i++) {
        const im = items[i];
        const path = `${me.id}/${messageId}/${crypto.randomUUID()}.${extForMime(im.mime)}`;
        console.log("[SEND] uploading", i + 1, "/", items.length, path);
        const { error } = await supabase.storage.from("chat-images").upload(path, im.file, {
          contentType: im.mime, upsert: false, cacheControl: "3600",
        });
        if (error) throw new Error(error.message);
        console.log("[SEND] upload OK", path);
        uploaded.push({ path, size: im.size, width: im.width || 0, height: im.height || 0, mime: im.mime });
        setUploadPct(Math.round(((i + 1) / items.length) * 100));
      }
      console.log("[SEND] calling sendImageFn (DB insert)…");
      await sendImageFn({ data: { messageId, receiverId: peer.id, attachments: uploaded, caption: caption || undefined, mode } });
      console.log("[SEND] DB insert OK", { messageId, mode });
      const nowIso = new Date().toISOString();
      const optimistic: MessageRow = {
        id: messageId,
        sender_id: me.id,
        receiver_id: peer.id,
        content: caption ?? "",
        caption: caption ?? null,
        read_at: null,
        created_at: nowIso,
        message_type: "image_request",
        attachments: uploaded as unknown as MessageRow["attachments"],
        image_mode: mode,
        image_request_status: "pending",
        expires_at: null,
      } as MessageRow;
      setMessages((prev) => {
        if (prev.some((x) => x.id === messageId)) return prev;
        console.log("[SEND] optimistic append", messageId, "count", prev.length, "->", prev.length + 1);
        return [...prev, optimistic];
      });
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPending([]);
      setPickerOpen(false);
    } catch (e) {
      console.error("[SEND] failed", e);
      toast.error(e instanceof Error ? e.message : "Upload failed");
      if (uploaded.length) {
        await supabase.storage.from("chat-images").remove(uploaded.map((u) => u.path));
      }
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };


  const removePending = (id: string) => {
    setPending((p) => {
      const gone = p.find((x) => x.id === id);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      const rest = p.filter((x) => x.id !== id);
      if (rest.length === 0) setPickerOpen(false);
      return rest;
    });
  };

  // Paste image support
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of items) {
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f && ACCEPTED_TYPES.includes(f.type)) files.push(f);
        }
      }
      if (files.length) { e.preventDefault(); addFiles(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.length]);

  // Full-window drag & drop for image files.
  const [dragActive, setDragActive] = useState(false);
  useEffect(() => {
    let counter = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      counter++;
      setDragActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      counter = Math.max(0, counter - 1);
      if (counter === 0) setDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      counter = 0;
      setDragActive(false);
      const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith("image/"));
      if (files.length) addFiles(files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.length]);

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

  // ---------- FLOW 1: Normal conversation gallery (independent) ----------
  // Included: image_mode === 'normal' OR (image_mode === 'request' AND status === 'accepted')
  // Excluded: preview_once (isolated flow), unaccepted requests.
  void normalOpenKey;

  const normalGalleryItems: GalleryItem[] = (() => {
    const items: GalleryItem[] = [];
    for (const m of messages) {
      if (m.message_type !== "image_request") continue;
      const mode = m.image_mode ?? "normal";
      if (mode === "preview_once") continue;
      if (mode === "request" && m.image_request_status !== "accepted") continue;
      const atts = Array.isArray(m.attachments) ? m.attachments : [];
      for (let i = 0; i < atts.length; i++) {
        items.push({
          key: `${m.id}:${i}`,
          msgId: m.id,
          attIndex: i,
          senderId: m.sender_id,
          createdAt: m.created_at,
        });
      }
    }
    return items;
  })();

  const senders: Record<string, ProfileLite> = { [me.id]: me, [peer.id]: peer };

  const resolveNormalUrls = async (msgId: string): Promise<string[]> => {
    const cached = thumbCache[msgId];
    if (cached) return cached;
    let p = urlPromises.current.get(msgId);
    if (!p) {
      p = getImageUrlsFn({ data: { messageId: msgId } })
        .then((r) => r.urls)
        .catch((e) => { urlPromises.current.delete(msgId); throw e; });
      urlPromises.current.set(msgId, p);
    }
    const urls = await p;
    setThumbCache((c) => (c[msgId] ? c : { ...c, [msgId]: urls }));
    return urls;
  };

  const openNormalGallery = (msgId: string, attIndex: number) => setNormalOpenKey(`${msgId}:${attIndex}`);
  const closeNormalGallery = () => setNormalOpenKey(null);

  // ---------- FLOW 3: Preview Once isolated viewer (independent) ----------
  const openPreviewOnce = (msgId: string, urls: string[]) => setPreviewOnce({ msgId, urls });
  const closePreviewOnce = () => setPreviewOnce(null); // signed URLs are dropped from memory here

  const previewOnceItems: GalleryItem[] = previewOnce
    ? previewOnce.urls.map((_, i) => {
        const m = messages.find((x) => x.id === previewOnce.msgId);
        return {
          key: `${previewOnce.msgId}:${i}`,
          msgId: previewOnce.msgId,
          attIndex: i,
          senderId: m?.sender_id ?? peer.id,
          createdAt: m?.created_at ?? new Date().toISOString(),
        };
      })
    : [];
  const resolvePreviewOnceUrls = async (): Promise<string[]> => previewOnce?.urls ?? [];



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
        <Button
          variant="ghost" size="icon" aria-label={`Call ${peer.display_name}`} disabled={calling}
          onClick={async () => {
            setCalling(true);
            try {
              const r = await startCallFn({ data: { calleeId: peer.id } });
              openVoiceCall({
                callId: r.callId, token: r.token, url: r.url, peer, role: "caller", initialStatus: "ringing",
              });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Couldn't start call");
            } finally { setCalling(false); }
          }}
        >
          <Phone className="size-5" />
        </Button>
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

            if (m.message_type === "image_request") {
              return (
                <ImageMessage
                  key={m.id}
                  msg={m}
                  me={me}
                  peer={peer}
                  mine={mine}
                  thumbUrls={thumbCache[m.id]}
                  onOpen={openNormalGallery}
                  onOpenPreviewOnce={openPreviewOnce}
                />
              );
            }



            const call = parseCallLog(m.content);
            if (call) {
              const iAmCaller = call.caller_id === me.id;
              const missed = call.status === "missed" || (call.status === "declined" && !iAmCaller && call.duration === 0);
              const declined = call.status === "declined";
              const noAnswer = call.status === "missed";
              let label: string;
              let Icon = PhoneOff;
              let tone = "text-muted-foreground";
              if (call.duration > 0) {
                label = `${iAmCaller ? "Outgoing" : "Incoming"} voice call · ${fmtDuration(call.duration)}`;
                Icon = iAmCaller ? PhoneOutgoing : PhoneIncoming;
              } else if (noAnswer) {
                label = iAmCaller ? "No answer" : "Missed voice call";
                Icon = PhoneMissed;
                tone = iAmCaller ? "text-muted-foreground" : "text-destructive";
              } else if (declined) {
                label = iAmCaller ? "Call declined" : "You declined the call";
                Icon = PhoneOff;
              } else {
                label = "Call ended";
              }
              const deleteMessage = async () => {
                const { error } = await supabase.from("messages").delete().eq("id", m.id);
                if (error) toast.error(error.message);
              };
              const callBack = async () => {
                try {
                  const r = await startCallFn({ data: { calleeId: peer.id } });
                  openVoiceCall({ callId: r.callId, token: r.token, url: r.url, peer, role: "caller", initialStatus: "ringing" });
                } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't start call"); }
              };
              return (
                <div key={m.id} className="flex justify-center my-2">
                  <div className="flex items-center gap-2 bg-card/80 border border-border rounded-full pl-3 pr-1 py-1 shadow-sm text-xs">
                    <Icon className={cn("size-4", tone)} />
                    <span className={cn("font-medium", missed && !iAmCaller && "text-destructive")}>{label}</span>
                    <span className="text-muted-foreground">· {formatTime(m.created_at)}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button aria-label="Call log options" className="p-1 rounded-full hover:bg-muted text-muted-foreground">
                          <MoreVertical className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={callBack}>
                          <Phone className="size-4 mr-2" /> Call back
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={deleteMessage}>
                          <Trash2 className="size-4 mr-2" /> Delete log
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            }

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

      <form
        onSubmit={send}
        className="p-3 border-t border-border bg-card"
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
        onDrop={(e) => {
          if (e.dataTransfer.files?.length) { e.preventDefault(); addFiles(e.dataTransfer.files); }
        }}
      >
        <div className="max-w-3xl mx-auto flex gap-2 items-center">
          <input
            ref={fileInputRef} type="file" accept={ACCEPTED_TYPES.join(",")} multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }}
          />
          <Button type="button" variant="ghost" size="icon" aria-label="Attach images" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="size-5" />
          </Button>
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

      <ImagePreviewModal
        open={pickerOpen}
        images={pending}
        onClose={() => {
          pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
          setPending([]);
          setPickerOpen(false);
        }}
        onRemove={removePending}
        onSend={sendImages}
        sending={uploading}
        progress={uploadPct}
      />

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

      {dragActive && (
        <div className="fixed inset-0 z-[60] pointer-events-none backdrop-blur-sm bg-background/60 flex items-center justify-center">
          <div className="m-6 p-10 rounded-3xl border-2 border-dashed border-primary bg-card/90 shadow-2xl text-center">
            <div className="text-5xl mb-3">📷</div>
            <div className="text-lg font-semibold">Drop images to send</div>
            <div className="text-sm text-muted-foreground mt-1">Up to {MAX_COUNT} images · 20MB each</div>
          </div>
        </div>
      )}


      {/* FLOW 1 — Normal conversation gallery */}
      {normalOpenKey && normalGalleryItems.length > 0 && (
        <ChatImageViewer
          items={normalGalleryItems}
          startKey={normalOpenKey}
          senders={senders}
          resolveUrls={resolveNormalUrls}
          onClose={closeNormalGallery}
          badge={null}
        />
      )}

      {/* FLOW 3 — Preview Once isolated viewer (single message, one-shot) */}
      {previewOnce && previewOnceItems.length > 0 && (
        <ChatImageViewer
          items={previewOnceItems}
          startKey={previewOnceItems[0].key}
          senders={senders}
          resolveUrls={resolvePreviewOnceUrls}
          onClose={closePreviewOnce}
          badge="Preview Once · Temporary Access"
        />
      )}
    </div>
  );
}

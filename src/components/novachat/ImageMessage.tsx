import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ImageIcon, Eye, Check, X, Loader2, Clock, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { respondImageRequest } from "@/lib/image.functions";
import { formatBytes, type PreparedImage } from "@/lib/image-utils";
import { formatTime, initials, type MessageRow, type ProfileLite } from "@/lib/novachat-types";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ImgMsg = MessageRow & Partial<Record<string, any>>;
type Att = { path: string; size: number; width: number; height: number; mime: string };

export function ImageMessage({
  msg, me, peer, mine, thumbUrls, onOpen, onPreviewUrls,
}: {
  msg: ImgMsg; me: ProfileLite; peer: ProfileLite; mine: boolean;
  /** Optional thumbnail URLs (already-resolved signed URLs) keyed by attachment index. */
  thumbUrls?: string[];
  /** Open the shared chat gallery viewer at this message + attachment index. */
  onOpen: (msgId: string, attIndex: number) => void;
  /** Called after a successful preview-once so the parent can cache URLs before opening. */
  onPreviewUrls: (msgId: string, urls: string[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const respond = useServerFn(respondImageRequest);

  const attachments: Att[] = Array.isArray(msg.attachments) ? msg.attachments : [];
  const status: string = msg.image_request_status ?? "pending";
  const mode: "normal" | "preview_once" = msg.image_mode === "preview_once" ? "preview_once" : "normal";
  const totalSize = attachments.reduce((a, b) => a + (b.size ?? 0), 0);

  const displayName = mine ? me.display_name : peer.display_name;
  const avatarUrl = mine ? me.avatar_url : peer.avatar_url;

  const doAccept = async () => {
    setLoading(true);
    try {
      await respond({ data: { messageId: msg.id, action: "accept" } });
      toast.success("Images accepted");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  };
  const doPreview = async () => {
    setLoading(true);
    try {
      const r = await respond({ data: { messageId: msg.id, action: "preview" } });
      if (r.urls && r.urls.length) {
        onPreviewUrls(msg.id, r.urls);
        onOpen(msg.id, 0);
      } else {
        toast.error("This image is no longer available.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "This image is no longer available.");
    } finally { setLoading(false); }
  };
  const doDecline = async () => {
    setLoading(true);
    try { await respond({ data: { messageId: msg.id, action: "decline" } }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  };

  // ---------- RECEIVER: pending request card ----------
  if (!mine && status === "pending") {
    return (
      <Bubble mine={mine}>
        <div className="p-3 min-w-[260px]">
          <div className="flex items-center gap-2 mb-2">
            <Avatar className="size-8"><AvatarImage src={avatarUrl ?? undefined} /><AvatarFallback>{initials(displayName)}</AvatarFallback></Avatar>
            <div className="text-sm">
              <span className="font-semibold">{displayName}</span> wants to send you{" "}
              <span className="font-semibold">{attachments.length}</span> image{attachments.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1 mb-2">
            {attachments.slice(0, 6).map((_, i) => (
              <div key={i} className="aspect-square rounded-md bg-muted flex items-center justify-center">
                <ImageIcon className="size-6 text-muted-foreground/60" />
              </div>
            ))}
          </div>
          {msg.caption && <div className="text-sm mb-2 italic text-muted-foreground">"{msg.caption}"</div>}
          <div className="text-xs text-muted-foreground mb-3">Total: {formatBytes(totalSize)}</div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={doAccept} disabled={loading}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Accept
            </Button>
            <Button size="sm" variant="secondary" onClick={doPreview} disabled={loading}>
              <Eye className="size-3.5" /> Preview once
            </Button>
            <Button size="sm" variant="ghost" onClick={doDecline} disabled={loading}>
              <X className="size-3.5" /> Decline
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground text-right mt-2">{formatTime(msg.created_at)}</div>
        </div>
      </Bubble>
    );
  }

  if (status === "declined") {
    return <Bubble mine={mine}><Info icon={<Ban className="size-4" />} text={mine ? "Recipient declined your image" : "Image request declined"} time={msg.created_at} /></Bubble>;
  }
  if (status === "expired") {
    return <Bubble mine={mine}><Info icon={<Clock className="size-4" />} text="Image request expired" time={msg.created_at} /></Bubble>;
  }
  if (!mine && status === "previewed") {
    return <Bubble mine={mine}><Info icon={<Eye className="size-4" />} text="Preview expired. Ask sender to resend." time={msg.created_at} /></Bubble>;
  }

  // ---------- Sender view (any status) OR receiver accepted: show grid ----------
  return (
    <Bubble mine={mine}>
      <div className="p-1.5 max-w-[320px]">
        <ImageGrid
          attachments={attachments}
          urls={thumbUrls ?? null}
          onOpenAt={(i) => onOpen(msg.id, i)}
        />
        {msg.caption && <div className="px-2 py-1 text-sm">{msg.caption}</div>}
        <div className="flex items-center justify-between px-2 pb-1 text-[10px] text-muted-foreground">
          <span>
            {mine && status === "pending" && "Waiting for acceptance…"}
            {mine && status === "accepted" && "✓ Accepted"}
            {mine && status === "previewed" && "👁 Recipient previewed your image"}
            {!mine && status === "accepted" && "Accepted"}
          </span>
          <span>{formatTime(msg.created_at)}</span>
        </div>
      </div>
    </Bubble>
  );
}

function Bubble({ mine, children }: { mine: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={cn(
        "max-w-[85%] sm:max-w-[70%] rounded-2xl shadow-sm overflow-hidden",
        mine ? "bg-bubble-me text-bubble-me-foreground" : "bg-bubble-other text-bubble-other-foreground border border-border",
      )}>
        {children}
      </div>
    </div>
  );
}

function Info({ icon, text, time }: { icon: React.ReactNode; text: string; time: string }) {
  return (
    <div className="p-3 flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span>{text}</span>
      <span className="ml-2 text-[10px] text-muted-foreground">{formatTime(time)}</span>
    </div>
  );
}

function ImageGrid({ attachments, urls, onOpenAt }: {
  attachments: Att[]; urls: string[] | null; onOpenAt: (i: number) => void;
}) {
  const count = attachments.length;
  const cols = count === 1 ? 1 : 2;
  const shown = attachments.slice(0, 4);
  const extra = count - shown.length;

  return (
    <div className={cn("grid gap-0.5 rounded-lg overflow-hidden", cols === 1 ? "grid-cols-1" : "grid-cols-2")}>
      {shown.map((a, i) => (
        <button
          key={a.path}
          type="button"
          onClick={() => onOpenAt(i)}
          className={cn(
            "relative bg-muted overflow-hidden group",
            count === 1 ? "aspect-video" : "aspect-square",
            count === 3 && i === 0 ? "row-span-2" : "",
          )}
        >
          {urls?.[i] ? (
            <img
              src={urls[i]} alt="" loading="lazy"
              className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="size-full flex items-center justify-center">
              <ImageIcon className="size-8 text-muted-foreground/50" />
            </div>
          )}
          {i === 3 && extra > 0 && (
            <div className="absolute inset-0 bg-black/60 text-white text-2xl font-semibold flex items-center justify-center">
              +{extra}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// Types helper for callers building attachments from PreparedImages
export function attachmentsFromPrepared(items: PreparedImage[], paths: string[]): Att[] {
  return items.map((im, i) => ({
    path: paths[i], size: im.size, width: im.width, height: im.height, mime: im.mime,
  }));
}

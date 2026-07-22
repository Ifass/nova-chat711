import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ImageIcon, Eye, Loader2, Clock, Ban, EyeOff, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { respondImageRequest } from "@/lib/image.functions";
import { type PreparedImage } from "@/lib/image-utils";
import { formatTime, initials, type MessageRow, type ProfileLite } from "@/lib/novachat-types";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ImgMsg = MessageRow & Partial<Record<string, any>>;
type Att = { path: string; size: number; width: number; height: number; mime: string };

export function ImageMessage({
  msg, me, peer, mine, thumbUrls, onOpen, onPreviewUrls,
}: {
  msg: ImgMsg; me: ProfileLite; peer: ProfileLite; mine: boolean;
  thumbUrls?: string[];
  onOpen: (msgId: string, attIndex: number) => void;
  onPreviewUrls: (msgId: string, urls: string[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const respond = useServerFn(respondImageRequest);

  const attachments: Att[] = Array.isArray(msg.attachments) ? msg.attachments : [];
  const status: string = msg.image_request_status ?? "pending";
  const mode: "normal" | "preview_once" = msg.image_mode === "preview_once" ? "preview_once" : "normal";

  const displayName = mine ? me.display_name : peer.display_name;
  const avatarUrl = mine ? me.avatar_url : peer.avatar_url;

  const doView = async () => {
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

  // ---------- RECEIVER: pending Preview Once — single "View Image" card ----------
  if (!mine && status === "pending" && mode === "preview_once") {
    return (
      <Bubble mine={mine}>
        <div className="p-4 min-w-[260px] max-w-[320px]">
          <div className="flex items-center gap-2 mb-3">
            <Avatar className="size-8"><AvatarImage src={avatarUrl ?? undefined} /><AvatarFallback>{initials(displayName)}</AvatarFallback></Avatar>
            <div className="text-sm min-w-0">
              <div className="font-semibold truncate">{displayName}</div>
              <div className="text-xs text-muted-foreground">sent a Preview Once</div>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-3 p-3 rounded-xl bg-primary/10 border border-primary/20">
            <Eye className="size-6 text-primary shrink-0" />
            <div className="text-sm">
              <div className="font-semibold">Preview Once Image{attachments.length > 1 ? `s (${attachments.length})` : ""}</div>
              <div className="text-xs text-muted-foreground">This image can only be viewed once.</div>
            </div>
          </div>
          <Button size="sm" className="w-full" onClick={doView} disabled={loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
            View Image
          </Button>
          <div className="text-[10px] text-muted-foreground text-right mt-2">{formatTime(msg.created_at)}</div>
        </div>
      </Bubble>
    );
  }

  // ---------- Terminal states ----------
  if (status === "declined") {
    return <Bubble mine={mine}><Info icon={<Ban className="size-4" />} text={mine ? "Recipient declined your image" : "Request declined"} time={msg.created_at} /></Bubble>;
  }
  if (status === "expired") {
    return <Bubble mine={mine}><Info icon={<Clock className="size-4" />} text="Image request expired" time={msg.created_at} /></Bubble>;
  }
  // Preview Once has been viewed — permanent placeholder for BOTH sides.
  if (status === "previewed" && mode === "preview_once") {
    return (
      <Bubble mine={mine}>
        <div className="p-3 min-w-[240px] max-w-[300px]">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-full bg-muted flex items-center justify-center shrink-0">
              <EyeOff className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <Eye className="size-3.5" /> Preview Once Image
              </div>
              <div className="text-xs text-primary flex items-center gap-1 mt-0.5">
                <Check className="size-3" /> Viewed
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                This image is no longer available.
              </div>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground text-right mt-2">{formatTime(msg.created_at)}</div>
        </div>
      </Bubble>
    );
  }

  // ---------- Sender/receiver view for normal images (or accepted legacy) ----------
  return (
    <Bubble mine={mine}>
      <div className="p-1.5 max-w-[320px]">
        <ImageGrid
          attachments={attachments}
          urls={thumbUrls ?? null}
          onOpenAt={(i) => onOpen(msg.id, i)}
        />
        {msg.caption && <div className="px-2 py-1 text-sm">{msg.caption}</div>}
        <div className="flex items-center justify-between px-2 pb-1 text-[10px] text-muted-foreground gap-2">
          <span className="flex items-center gap-1">
            {mode === "preview_once" && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                <Eye className="size-2.5" />Preview Once
              </span>
            )}
            {mine && mode === "preview_once" && status === "pending" && "Sent · Delivered"}
            {mine && mode === "normal" && "Sent"}
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

export function attachmentsFromPrepared(items: PreparedImage[], paths: string[]): Att[] {
  return items.map((im, i) => ({
    path: paths[i], size: im.size, width: im.width, height: im.height, mime: im.mime,
  }));
}

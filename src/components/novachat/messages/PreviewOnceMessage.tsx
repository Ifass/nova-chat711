import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Loader2, EyeOff, Check, CheckCheck, Ban, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { respondImageRequest } from "@/lib/image.functions";
import { formatTime, initials, type MessageRow, type ProfileLite } from "@/lib/novachat-types";
import { cn } from "@/lib/utils";
import { Bubble, RejectedImageGrid, type Att } from "./shared";

/**
 * FLOW 3 — PREVIEW ONCE (receiver-driven)
 *
 * SENDER — normal-looking image bubble with a "Preview Once" badge and
 * status footer (Sent / Viewed / Rejected).
 *
 * RECEIVER —
 *   pending  → permission prompt (Accept opens the isolated viewer, Reject destroys).
 *   accept   → viewer opens once; on close, message becomes terminal "Viewed".
 *   viewed / declined → terminal placeholder "This image is no longer available."
 */
export function PreviewOnceMessage({
  msg, me, peer, mine, thumbUrls, onOpenIsolated,
}: {
  msg: MessageRow;
  me: ProfileLite;
  peer: ProfileLite;
  mine: boolean;
  thumbUrls?: string[];
  onOpenIsolated: (msgId: string, urls: string[]) => void;
}) {
  void me;
  const status = msg.image_request_status ?? "pending";
  const attachments: Att[] = Array.isArray(msg.attachments) ? (msg.attachments as Att[]) : [];

  // Terminal placeholder — after view or reject.
  if (status === "previewed" || status === "declined" || status === "expired") {
    const rejected = status === "declined";
    return (
      <Bubble mine={mine}>
        <div className="p-3 min-w-[240px] max-w-[300px]">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-full bg-muted flex items-center justify-center shrink-0">
              {rejected ? <Ban className="size-5 text-muted-foreground" /> : <EyeOff className="size-5 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <Eye className="size-3.5" /> Preview Once Image
              </div>
              <div className="text-xs mt-0.5 flex items-center gap-1">
                {rejected ? (
                  <span className="text-destructive">🚫 Preview Once image rejected</span>
                ) : (
                  <span className="text-primary flex items-center gap-1">
                    <Check className="size-3" /> 👁 Viewed
                  </span>
                )}
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

  // Receiver + pending → permission prompt.
  if (!mine) {
    return <ReceiverPrompt msg={msg} peer={peer} onOpenIsolated={onOpenIsolated} />;
  }

  // Sender view — normal-looking image bubble with Preview Once badge + status.
  const count = attachments.length;
  const cols = count === 1 ? 1 : 2;
  const shown = attachments.slice(0, 4);
  const extra = count - shown.length;

  const statusNode =
    status === "accepted" ? (
      <span className="flex items-center gap-1 text-primary">
        <CheckCheck className="size-3" /> Accepted
      </span>
    ) : (
      <span className="flex items-center gap-1">
        <Check className="size-3" /> Sent
      </span>
    );

  return (
    <Bubble mine={mine}>
      <div className="p-1.5 max-w-[320px]">
        <div className="relative">
          <div className={cn("grid gap-0.5 rounded-lg overflow-hidden", cols === 1 ? "grid-cols-1" : "grid-cols-2")}>
            {shown.map((a, i) => (
              <div
                key={a.path}
                className={cn(
                  "relative bg-muted overflow-hidden",
                  count === 1 ? "aspect-video" : "aspect-square",
                  count === 3 && i === 0 ? "row-span-2" : "",
                )}
              >
                {thumbUrls?.[i] ? (
                  <img src={thumbUrls[i]} alt="" loading="lazy" className="size-full object-cover" />
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
              </div>
            ))}
          </div>
          <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-primary/90 text-primary-foreground text-[10px] flex items-center gap-1 font-medium shadow">
            <Eye className="size-3" /> Preview Once
          </div>
        </div>
        {msg.caption && <div className="px-2 py-1 text-sm">{msg.caption}</div>}
        <div className={cn(
          "flex items-center gap-2 px-2 pb-1 pt-0.5 text-[10px]",
          mine ? "text-bubble-me-foreground/70" : "text-muted-foreground",
        )}>
          <span>{formatTime(msg.created_at)}</span>
          <span className="ml-auto">{statusNode}</span>
        </div>
      </div>
    </Bubble>
  );
}

function ReceiverPrompt({
  msg, peer, onOpenIsolated,
}: {
  msg: MessageRow;
  peer: ProfileLite;
  onOpenIsolated: (msgId: string, urls: string[]) => void;
}) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const respond = useServerFn(respondImageRequest);
  const attachments: Att[] = Array.isArray(msg.attachments) ? (msg.attachments as Att[]) : [];
  const count = attachments.length;

  const doAccept = async () => {
    setBusy("accept");
    try {
      const r = await respond({ data: { messageId: msg.id, action: "preview" } });
      if (r.urls && r.urls.length) {
        onOpenIsolated(msg.id, r.urls);
      } else {
        toast.error("This image is no longer available.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "This image is no longer available.");
    } finally {
      setBusy(null);
    }
  };

  const doReject = async () => {
    setBusy("decline");
    try {
      await respond({ data: { messageId: msg.id, action: "decline" } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Bubble mine={false}>
      <div className="p-4 min-w-[260px] max-w-[320px]">
        <div className="flex items-center gap-2 mb-3">
          <Avatar className="size-8">
            <AvatarImage src={peer.avatar_url ?? undefined} />
            <AvatarFallback>{initials(peer.display_name)}</AvatarFallback>
          </Avatar>
          <div className="text-sm min-w-0">
            <div className="font-semibold truncate">📷 Incoming Preview Once Image</div>
            <div className="text-xs text-muted-foreground truncate">
              {peer.display_name} wants to send you a Preview Once image{count > 1 ? `s (${count})` : ""}.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mb-3 p-3 rounded-xl bg-primary/10 border border-primary/20">
          <Eye className="size-6 text-primary shrink-0" />
          <div className="text-sm">
            <div className="font-semibold">Viewable only once</div>
            <div className="text-xs text-muted-foreground">Accept opens the image immediately; it's destroyed after you close it.</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="destructive" className="flex-1" onClick={doReject} disabled={!!busy}>
            {busy === "decline" ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
            Reject
          </Button>
          <Button size="sm" className="flex-1" onClick={doAccept} disabled={!!busy}>
            {busy === "accept" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Accept
          </Button>
        </div>
        <div className="text-[10px] text-muted-foreground text-right mt-2">{formatTime(msg.created_at)}</div>
      </div>
    </Bubble>
  );
}

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Loader2, EyeOff, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { respondImageRequest } from "@/lib/image.functions";
import { formatTime, initials, type MessageRow, type ProfileLite } from "@/lib/novachat-types";
import { Bubble, type Att } from "./shared";

/**
 * FLOW 3 — PREVIEW_ONCE
 * Receiver sees a single "View Image" button. No Accept, no Reject, no
 * permanent download. Opening triggers the isolated Preview Once viewer;
 * closing marks the message as viewed and permanently removes access.
 * This component NEVER interacts with the normal conversation gallery.
 */
export function PreviewOnceMessage({
  msg, me, peer, mine, onOpenIsolated,
}: {
  msg: MessageRow;
  me: ProfileLite;
  peer: ProfileLite;
  mine: boolean;
  onOpenIsolated: (msgId: string, urls: string[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const respond = useServerFn(respondImageRequest);
  const status = msg.image_request_status ?? "pending";
  const attachments: Att[] = Array.isArray(msg.attachments) ? (msg.attachments as Att[]) : [];
  const senderName = mine ? me.display_name : peer.display_name;
  const senderAvatar = mine ? me.avatar_url : peer.avatar_url;

  // Terminal placeholder — same for both sides once viewed.
  if (status === "previewed" || status === "declined" || status === "expired") {
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

  // Sender pending — nothing to open, just a status card.
  if (mine) {
    return (
      <Bubble mine={mine}>
        <div className="p-3 min-w-[240px] max-w-[300px] flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary/15 text-primary grid place-items-center">
            <Eye className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Preview Once Sent</div>
            <div className="text-xs text-muted-foreground">Waiting for {peer.display_name} to view</div>
          </div>
          <span className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
        </div>
      </Bubble>
    );
  }

  // Receiver pending — single "View Image" action.
  const doView = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  return (
    <Bubble mine={mine}>
      <div className="p-4 min-w-[260px] max-w-[320px]">
        <div className="flex items-center gap-2 mb-3">
          <Avatar className="size-8">
            <AvatarImage src={senderAvatar ?? undefined} />
            <AvatarFallback>{initials(senderName)}</AvatarFallback>
          </Avatar>
          <div className="text-sm min-w-0">
            <div className="font-semibold truncate">{senderName}</div>
            <div className="text-xs text-muted-foreground">sent a Preview Once</div>
          </div>
        </div>
        <div className="flex items-center gap-3 mb-3 p-3 rounded-xl bg-primary/10 border border-primary/20">
          <Eye className="size-6 text-primary shrink-0" />
          <div className="text-sm">
            <div className="font-semibold">
              Preview Once Image{attachments.length > 1 ? `s (${attachments.length})` : ""}
            </div>
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

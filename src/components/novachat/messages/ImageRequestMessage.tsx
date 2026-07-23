import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Ban, ImageDown, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { respondImageRequest } from "@/lib/image.functions";
import { formatTime, initials, type MessageRow, type ProfileLite } from "@/lib/novachat-types";
import { Bubble, type Att } from "./shared";

/**
 * FLOW 2 — IMAGE_REQUEST
 * Receiver sees Accept / Reject only. On Accept the message flips to
 * status="accepted" and is thereafter rendered by NormalImageMessage
 * (which joins the conversation gallery). On Reject we show a terminal
 * "Image Request Declined" card. This component NEVER opens any viewer.
 */
export function ImageRequestMessage({
  msg, me, peer, mine,
}: {
  msg: MessageRow;
  me: ProfileLite;
  peer: ProfileLite;
  mine: boolean;
}) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const respond = useServerFn(respondImageRequest);
  const status = msg.image_request_status ?? "pending";
  const attachments: Att[] = Array.isArray(msg.attachments) ? (msg.attachments as Att[]) : [];
  const senderName = mine ? me.display_name : peer.display_name;
  const senderAvatar = mine ? me.avatar_url : peer.avatar_url;

  if (status === "declined") {
    return (
      <Bubble mine={mine}>
        <div className="p-3 flex items-center gap-2 text-sm">
          <Ban className="size-4 text-muted-foreground" />
          <span>{mine ? "Recipient declined the image" : "Image Request Declined"}</span>
          <span className="ml-2 text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
        </div>
      </Bubble>
    );
  }
  if (status === "expired") {
    return (
      <Bubble mine={mine}>
        <div className="p-3 flex items-center gap-2 text-sm">
          <Clock className="size-4 text-muted-foreground" />
          <span>Image request expired</span>
          <span className="ml-2 text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
        </div>
      </Bubble>
    );
  }

  // Sender pending: waiting for recipient.
  if (mine) {
    return (
      <Bubble mine={mine}>
        <div className="p-3 min-w-[240px] max-w-[300px] flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary/15 text-primary grid place-items-center">
            <ImageDown className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Image Request Sent</div>
            <div className="text-xs text-muted-foreground">
              Waiting for {peer.display_name} to accept · {attachments.length} image{attachments.length === 1 ? "" : "s"}
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
        </div>
      </Bubble>
    );
  }

  // Receiver pending: Accept / Reject.
  const act = async (action: "accept" | "decline") => {
    setBusy(action);
    try {
      await respond({ data: { messageId: msg.id, action } });
      // Realtime UPDATE will flip status; NormalImageMessage will then render on accept.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
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
            <div className="text-xs text-muted-foreground">wants to send you an image</div>
          </div>
        </div>
        <div className="flex items-center gap-3 mb-3 p-3 rounded-xl bg-muted/60 border border-border">
          <ImageDown className="size-6 text-primary shrink-0" />
          <div className="text-sm">
            <div className="font-semibold">
              {attachments.length} image{attachments.length === 1 ? "" : "s"} pending
            </div>
            <div className="text-xs text-muted-foreground">Accept to download, or decline.</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => act("decline")} disabled={!!busy}>
            {busy === "decline" ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
            Reject
          </Button>
          <Button size="sm" className="flex-1" onClick={() => act("accept")} disabled={!!busy}>
            {busy === "accept" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Accept
          </Button>
        </div>
        <div className="text-[10px] text-muted-foreground text-right mt-2">{formatTime(msg.created_at)}</div>
      </div>
    </Bubble>
  );
}

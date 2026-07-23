import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, CheckCheck, ImageIcon, Loader2, Ban, ImageDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { respondImageRequest } from "@/lib/image.functions";
import { formatTime, initials, type MessageRow, type ProfileLite } from "@/lib/novachat-types";
import { cn } from "@/lib/utils";
import { Bubble, RejectedImageGrid, ThumbImage, type Att } from "./shared";

/**
 * FLOW 1 — NORMAL IMAGE (receiver-driven permission)
 *
 * SENDER — always sees a real image bubble with a tiny status footer:
 *   pending  → "✓ Sent"
 *   accepted → "✓✓ Accepted"
 *   declined → "Rejected"
 *
 * RECEIVER —
 *   pending  → inline permission prompt (Accept / Reject). No image download.
 *   accepted → normal image bubble, joins conversation gallery.
 *   declined → "🚫 Image rejected" placeholder.
 */
export function NormalImageMessage({
  msg, me, peer, mine, thumbUrls, onOpen,
}: {
  msg: MessageRow;
  me: ProfileLite;
  peer: ProfileLite;
  mine: boolean;
  thumbUrls?: string[];
  onOpen: (msgId: string, attIndex: number) => void;
}) {
  const attachments: Att[] = Array.isArray(msg.attachments) ? (msg.attachments as Att[]) : [];
  const status = msg.image_request_status ?? "accepted";

  // Terminal: rejected / expired — keep the exact image container, blur it heavily.
  if (status === "declined" || status === "expired") {
    return (
      <RejectedImageGrid
        mine={mine}
        attachments={attachments}
        thumbUrls={thumbUrls}
        createdAt={msg.created_at}
      />
    );
  }

  // Receiver + pending → permission prompt only.
  if (!mine && status === "pending") {
    return <ReceiverPrompt msg={msg} peer={peer} />;
  }

  // Sender (any status) OR receiver-accepted → normal image grid.
  return (
    <ImageGrid
      msg={msg}
      me={me}
      mine={mine}
      status={status}
      attachments={attachments}
      thumbUrls={thumbUrls}
      onOpen={onOpen}
    />
  );
}

function ImageGrid({
  msg, me, mine, status, attachments, thumbUrls, onOpen,
}: {
  msg: MessageRow;
  me: ProfileLite;
  mine: boolean;
  status: string;
  attachments: Att[];
  thumbUrls?: string[];
  onOpen: (msgId: string, attIndex: number) => void;
}) {
  void me;
  const count = attachments.length;
  const cols = count === 1 ? 1 : 2;
  const shown = attachments.slice(0, 4);
  const extra = count - shown.length;

  // Sender status label (receiver-accepted side just shows time).
  let statusNode: React.ReactNode = null;
  if (mine) {
    if (status === "accepted") {
      statusNode = (
        <span className="flex items-center gap-1 text-primary">
          <CheckCheck className="size-3" /> Accepted
        </span>
      );
    } else if (status === "pending") {
      statusNode = (
        <span className="flex items-center gap-1">
          <Check className="size-3" /> Sent
        </span>
      );
    }
  }

  return (
    <Bubble mine={mine}>
      <div className="p-1.5 max-w-[320px]">
        <div className={cn("grid gap-0.5 rounded-lg overflow-hidden", cols === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {shown.map((a, i) => (
            <button
              key={a.path}
              type="button"
              onClick={() => onOpen(msg.id, i)}
              className={cn(
                "relative bg-muted overflow-hidden group",
                count === 1 ? "aspect-video" : "aspect-square",
                count === 3 && i === 0 ? "row-span-2" : "",
              )}
            >
              {thumbUrls?.[i] ? (
                <img
                  src={thumbUrls[i]}
                  alt=""
                  loading="lazy"
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
        {msg.caption && <div className="px-2 py-1 text-sm">{msg.caption}</div>}
        <div className={cn(
          "flex items-center gap-2 px-2 pb-1 pt-0.5 text-[10px]",
          mine ? "text-bubble-me-foreground/70" : "text-muted-foreground",
        )}>
          <span>{formatTime(msg.created_at)}</span>
          {statusNode && <span className="ml-auto">{statusNode}</span>}
        </div>
      </div>
    </Bubble>
  );
}

function ReceiverPrompt({ msg, peer }: { msg: MessageRow; peer: ProfileLite }) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const respond = useServerFn(respondImageRequest);
  const attachments: Att[] = Array.isArray(msg.attachments) ? (msg.attachments as Att[]) : [];
  const count = attachments.length;

  const act = async (action: "accept" | "decline") => {
    setBusy(action);
    try {
      await respond({ data: { messageId: msg.id, action } });
      // Realtime UPDATE will flip status; this component will unmount on accept.
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
            <div className="font-semibold truncate">📷 Incoming Image</div>
            <div className="text-xs text-muted-foreground truncate">
              {peer.display_name} wants to send you {count} image{count === 1 ? "" : "s"}.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mb-3 p-3 rounded-xl bg-muted/60 border border-border">
          <ImageDown className="size-6 text-primary shrink-0" />
          <div className="text-sm">
            <div className="font-semibold">
              {count} image{count === 1 ? "" : "s"} pending
            </div>
            <div className="text-xs text-muted-foreground">Accept to download, or reject.</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="destructive" className="flex-1" onClick={() => act("decline")} disabled={!!busy}>
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

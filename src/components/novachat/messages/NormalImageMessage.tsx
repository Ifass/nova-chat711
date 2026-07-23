import { ImageIcon } from "lucide-react";
import { formatTime, type MessageRow } from "@/lib/novachat-types";
import { cn } from "@/lib/utils";
import { Bubble, type Att } from "./shared";

/**
 * FLOW 1 — NORMAL_IMAGE
 * Inline image grid. Opens the conversation-wide gallery on tap.
 * Used for messages sent as "Normal" AND for image requests that
 * have been accepted (they become normal images from that point on).
 */
export function NormalImageMessage({
  msg, mine, thumbUrls, onOpen,
}: {
  msg: MessageRow;
  mine: boolean;
  thumbUrls?: string[];
  onOpen: (msgId: string, attIndex: number) => void;
}) {
  const attachments: Att[] = Array.isArray(msg.attachments) ? (msg.attachments as Att[]) : [];
  const count = attachments.length;
  const cols = count === 1 ? 1 : 2;
  const shown = attachments.slice(0, 4);
  const extra = count - shown.length;

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
        <div className="flex items-center justify-end px-2 pb-1 text-[10px] text-muted-foreground">
          <span>{formatTime(msg.created_at)}</span>
        </div>
      </div>
    </Bubble>
  );
}

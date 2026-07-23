import { NormalImageMessage } from "./messages/NormalImageMessage";
import { PreviewOnceMessage } from "./messages/PreviewOnceMessage";
import type { MessageRow, ProfileLite } from "@/lib/novachat-types";

/**
 * Dispatcher — routes an image message to exactly one flow.
 * The permission system is receiver-driven; sender always sees a
 * normal-looking image bubble with a small status footer.
 *
 *   image_mode                       | component
 *   ---------------------------------|----------------------
 *   preview_once                     | PreviewOnceMessage
 *   normal (or legacy "request"/null)| NormalImageMessage
 */
export function ImageMessage({
  msg, me, peer, mine, thumbUrls, onOpen, onOpenPreviewOnce,
}: {
  msg: MessageRow;
  me: ProfileLite;
  peer: ProfileLite;
  mine: boolean;
  thumbUrls?: string[];
  onOpen: (msgId: string, attIndex: number) => void;
  onOpenPreviewOnce: (msgId: string, urls: string[]) => void;
}) {
  const mode = msg.image_mode ?? "normal";
  if (mode === "preview_once") {
    return (
      <PreviewOnceMessage
        msg={msg}
        me={me}
        peer={peer}
        mine={mine}
        thumbUrls={thumbUrls}
        onOpenIsolated={onOpenPreviewOnce}
      />
    );
  }
  return (
    <NormalImageMessage
      msg={msg}
      me={me}
      peer={peer}
      mine={mine}
      thumbUrls={thumbUrls}
      onOpen={onOpen}
    />
  );
}

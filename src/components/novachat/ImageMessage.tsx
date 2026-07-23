import { NormalImageMessage } from "./messages/NormalImageMessage";
import { ImageRequestMessage } from "./messages/ImageRequestMessage";
import { PreviewOnceMessage } from "./messages/PreviewOnceMessage";
import type { MessageRow, ProfileLite } from "@/lib/novachat-types";

/**
 * Dispatcher — routes an image message to exactly one of the three
 * independent flow components. No shared state lives here.
 *
 *   image_mode                | status         | component
 *   --------------------------|----------------|----------------------
 *   preview_once              | *              | PreviewOnceMessage
 *   request                   | pending/decl.  | ImageRequestMessage
 *   request                   | accepted       | NormalImageMessage
 *   normal (or legacy null)   | *              | NormalImageMessage
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
  const status = msg.image_request_status ?? "accepted";

  if (mode === "preview_once") {
    return <PreviewOnceMessage msg={msg} me={me} peer={peer} mine={mine} onOpenIsolated={onOpenPreviewOnce} />;
  }
  if (mode === "request" && status !== "accepted") {
    return <ImageRequestMessage msg={msg} me={me} peer={peer} mine={mine} />;
  }
  return <NormalImageMessage msg={msg} mine={mine} thumbUrls={thumbUrls} onOpen={onOpen} />;
}

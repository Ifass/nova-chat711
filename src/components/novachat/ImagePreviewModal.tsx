import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, ChevronLeft, ChevronRight, Send, Loader2 } from "lucide-react";
import { formatBytes, type PreparedImage } from "@/lib/image-utils";

export function ImagePreviewModal({
  open, images, onClose, onRemove, onSend, sending, progress,
}: {
  open: boolean;
  images: PreparedImage[];
  onClose: () => void;
  onRemove: (id: string) => void;
  onSend: (caption: string) => void;
  sending: boolean;
  progress: number;
}) {
  const [idx, setIdx] = useState(0);
  const [caption, setCaption] = useState("");

  useEffect(() => { if (idx >= images.length && images.length > 0) setIdx(images.length - 1); }, [images.length, idx]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx((i) => Math.min(images.length - 1, i + 1));
      if (e.key === "Escape" && !sending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, images.length, sending, onClose]);

  const total = images.reduce((a, b) => a + b.size, 0);
  const current = images[idx];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send {images.length} image{images.length === 1 ? "" : "s"} · {formatBytes(total)}</DialogTitle>
        </DialogHeader>
        {current && (
          <div className="relative rounded-lg overflow-hidden bg-black/90 aspect-video flex items-center justify-center">
            <img src={current.previewUrl} alt="" className="max-h-full max-w-full object-contain" />
            {images.length > 1 && (
              <>
                <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white disabled:opacity-30" aria-label="Previous">
                  <ChevronLeft className="size-5" />
                </button>
                <button onClick={() => setIdx((i) => Math.min(images.length - 1, i + 1))} disabled={idx === images.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white disabled:opacity-30" aria-label="Next">
                  <ChevronRight className="size-5" />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded-full bg-black/60 text-white text-xs">
                  {idx + 1} / {images.length}
                </div>
              </>
            )}
            {!sending && (
              <button onClick={() => onRemove(current.id)}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-destructive" aria-label="Remove image">
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((im, i) => (
              <button key={im.id} onClick={() => setIdx(i)}
                className={`relative shrink-0 size-14 rounded-md overflow-hidden border-2 ${i === idx ? "border-primary" : "border-transparent"}`}>
                <img src={im.previewUrl} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <Input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add a caption (optional)"
          maxLength={500}
          disabled={sending}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            Sent as an <span className="font-medium">image request</span> — {sending ? `uploading… ${progress}%` : "recipient will accept, preview, or decline."}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
            <Button onClick={() => onSend(caption)} disabled={sending || images.length === 0}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {sending ? `${progress}%` : "Send"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

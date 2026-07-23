import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, ChevronLeft, ChevronRight, Send, Loader2, ImageIcon, Eye, Image as ImageIcon2 } from "lucide-react";
import { formatBytes, type PreparedImage } from "@/lib/image-utils";
import { cn } from "@/lib/utils";

export type ImageMode = "normal" | "preview_once";

export function ImagePreviewModal({
  open, images, onClose, onRemove, onSend, sending, progress,
}: {
  open: boolean;
  images: PreparedImage[];
  onClose: () => void;
  onRemove: (id: string) => void;
  onSend: (caption: string, mode: ImageMode) => void;
  sending: boolean;
  progress: number;
}) {
  const [idx, setIdx] = useState(0);
  const [caption, setCaption] = useState("");
  const [mode, setMode] = useState<ImageMode>("normal");

  useEffect(() => { if (idx >= images.length && images.length > 0) setIdx(images.length - 1); }, [images.length, idx]);
  useEffect(() => { if (!open) { setMode("normal"); setCaption(""); } }, [open]);
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
  const anyLoading = images.some((i) => i.status === "loading");
  const anyCompressing = images.some((i) => i.compressing);
  const readyCount = images.filter((i) => i.status === "ready").length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Send {images.length} image{images.length === 1 ? "" : "s"}
            {total > 0 && ` · ${formatBytes(total)}`}
          </DialogTitle>
        </DialogHeader>
        {current && (
          <div className="relative rounded-lg overflow-hidden bg-black/90 aspect-video flex items-center justify-center">
            {current.status === "loading" ? (
              <div className="flex flex-col items-center gap-3 text-white/80">
                <div className="relative">
                  <ImageIcon className="size-12 opacity-60" />
                  <span className="absolute inset-0 shimmer-mask rounded-md" />
                </div>
                <Loader2 className="size-5 animate-spin" />
                <div className="text-xs">Preparing image…</div>
              </div>
            ) : current.status === "error" ? (
              <div className="text-white/80 text-sm px-6 text-center">
                Couldn't load this image{current.error ? `: ${current.error}` : ""}.
              </div>
            ) : (
              <img src={current.previewUrl} alt="" className="max-h-full max-w-full object-contain" />
            )}
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
            {mode === "preview_once" && (
              <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-primary/90 text-primary-foreground text-[11px] flex items-center gap-1 font-medium">
                <Eye className="size-3" /> Preview Once
              </div>
            )}
            {current.compressing && current.status !== "loading" && (
              <div className="absolute bottom-2 left-2 px-2 py-1 rounded-full bg-black/60 text-white text-[11px] flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" /> Compressing…
              </div>
            )}
          </div>
        )}
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((im, i) => (
              <button key={im.id} onClick={() => setIdx(i)}
                className={`relative shrink-0 size-14 rounded-md overflow-hidden border-2 ${i === idx ? "border-primary" : "border-transparent"}`}>
                {im.status === "loading" ? (
                  <div className="size-full bg-muted animate-pulse grid place-items-center">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : im.status === "error" ? (
                  <div className="size-full bg-destructive/20 grid place-items-center text-destructive text-xs">!</div>
                ) : (
                  <img src={im.previewUrl} alt="" className="size-full object-cover" />
                )}
                {im.compressing && im.status === "ready" && (
                  <div className="absolute inset-0 bg-black/30 grid place-items-center">
                    <Loader2 className="size-3 animate-spin text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
        {/* Mode toggle — receiver approves either way; Preview Once destroys after viewing */}
        <div className="flex items-center gap-1 rounded-lg border border-border p-1 bg-muted/40">
          <ModeChip active={mode === "normal"} onClick={() => setMode("normal")} disabled={sending}
            icon={<ImageIcon2 className="size-3.5" />} label="Normal" />
          <ModeChip active={mode === "preview_once"} onClick={() => setMode("preview_once")} disabled={sending}
            icon={<Eye className="size-3.5" />} label="Preview Once" />
        </div>
        <div className="text-[11px] text-muted-foreground -mt-1 px-1">
          {mode === "preview_once"
            ? "Recipient must Accept to view once. Image is destroyed after they close it."
            : "Recipient must Accept to download. Rejected images are never delivered."}
        </div>

        <Input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add a caption (optional)"
          maxLength={500}
          disabled={sending}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {sending
              ? `Uploading… ${progress}%`
              : anyLoading
                ? `Preparing ${readyCount}/${images.length}…`
                : anyCompressing
                  ? "Compressing in background — you can still send."
                  : mode === "preview_once"
                    ? "Sent as Preview Once."
                    : "Waiting for recipient to accept."}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
            <Button onClick={() => onSend(caption, mode)} disabled={sending || images.length === 0 || anyLoading}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {sending ? `${progress}%` : "Send"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModeChip({ active, onClick, disabled, icon, label }: {
  active: boolean; onClick: () => void; disabled?: boolean; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={cn(
        "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted",
        disabled && "opacity-60 cursor-not-allowed",
      )}
    >
      {icon}{label}
    </button>
  );
}


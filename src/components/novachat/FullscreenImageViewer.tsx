import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";

export function FullscreenImageViewer({
  urls, startIndex, onClose,
}: {
  urls: string[];
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") { setIdx((i) => Math.max(0, i - 1)); setZoom(1); }
      if (e.key === "ArrowRight") { setIdx((i) => Math.min(urls.length - 1, i + 1)); setZoom(1); }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [urls.length, onClose]);

  const download = async () => {
    try {
      const r = await fetch(urls[idx]);
      const b = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `nova-${Date.now()}.${(b.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg")}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center animate-in fade-in duration-150" role="dialog" aria-modal="true">
      <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close">
        <X className="size-6" />
      </button>
      <button onClick={download} className="absolute top-4 right-16 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Download">
        <Download className="size-5" />
      </button>
      {urls.length > 1 && (
        <>
          <button onClick={() => { setIdx((i) => Math.max(0, i - 1)); setZoom(1); }} disabled={idx === 0}
            className="absolute left-4 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30" aria-label="Previous">
            <ChevronLeft className="size-6" />
          </button>
          <button onClick={() => { setIdx((i) => Math.min(urls.length - 1, i + 1)); setZoom(1); }} disabled={idx === urls.length - 1}
            className="absolute right-4 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30" aria-label="Next">
            <ChevronRight className="size-6" />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-sm">
            {idx + 1} / {urls.length}
          </div>
        </>
      )}
      <img
        src={urls[idx]}
        alt=""
        onDoubleClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
        style={{ transform: `scale(${zoom})`, transition: "transform 0.2s" }}
        className="max-h-[90vh] max-w-[92vw] object-contain cursor-zoom-in select-none"
      />
    </div>
  );
}

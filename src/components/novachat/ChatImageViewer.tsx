import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Download, Loader2, AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials, type ProfileLite } from "@/lib/novachat-types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type GalleryItem = {
  key: string;         // `${msgId}:${attIndex}`
  msgId: string;
  attIndex: number;
  senderId: string;
  createdAt: string;
};

type Props = {
  items: GalleryItem[];
  startKey: string;
  senders: Record<string, ProfileLite>;
  /** Returns signed URLs for every attachment in this message. Cached by caller. */
  resolveUrls: (msgId: string) => Promise<string[]>;
  onClose: () => void;
};

function formatHeader(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Today • ${time}`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday • ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} • ${time}`;
}

export function ChatImageViewer({ items, startKey, senders, resolveUrls, onClose }: Props) {
  const startIdx = Math.max(0, items.findIndex((i) => i.key === startKey));
  const [idx, setIdx] = useState(startIdx);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [urlByKey, setUrlByKey] = useState<Record<string, string | "error">>({});
  const urlPromises = useRef<Map<string, Promise<string[]>>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  const cur = items[idx];

  const getMsgUrls = useCallback((msgId: string) => {
    let p = urlPromises.current.get(msgId);
    if (!p) { p = resolveUrls(msgId); urlPromises.current.set(msgId, p); }
    return p;
  }, [resolveUrls]);

  const loadOne = useCallback(async (i: number) => {
    const it = items[i]; if (!it) return;
    if (urlByKey[it.key]) return;
    try {
      const urls = await getMsgUrls(it.msgId);
      const url = urls[it.attIndex];
      setUrlByKey((m) => ({ ...m, [it.key]: url ?? "error" }));
    } catch {
      setUrlByKey((m) => ({ ...m, [it.key]: "error" }));
    }
  }, [items, urlByKey, getMsgUrls]);

  // Preload current ± 2
  useEffect(() => {
    for (const off of [0, 1, -1, 2, -2]) {
      const i = idx + off;
      if (i >= 0 && i < items.length) loadOne(i);
    }
  }, [idx, items, loadOne]);

  // Reset zoom on change
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [idx]);

  const go = useCallback((delta: number) => {
    setIdx((i) => Math.max(0, Math.min(items.length - 1, i + delta)));
  }, [items.length]);

  // Keyboard + lock scroll
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(4, z + 0.5));
      else if (e.key === "-") setZoom((z) => Math.max(1, z - 0.5));
      else if (e.key === "0") { setZoom(1); setPan({ x: 0, y: 0 }); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [go, onClose]);

  const download = async () => {
    const url = urlByKey[cur.key];
    if (!url || url === "error") return;
    try {
      const r = await fetch(url);
      const b = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      const ext = (b.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
      a.download = `nova-${Date.now()}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch { toast.error("Download failed"); }
  };

  // Wheel zoom
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 30) return;
    e.preventDefault?.();
    setZoom((z) => Math.max(1, Math.min(4, z - e.deltaY * 0.003)));
  };

  // Touch / pointer gestures
  const touchState = useRef<{
    mode: "none" | "swipe" | "pan" | "pinch";
    startX: number; startY: number;
    startPan: { x: number; y: number };
    pinchStart: number; zoomStart: number;
    lastTap: number;
  }>({ mode: "none", startX: 0, startY: 0, startPan: { x: 0, y: 0 }, pinchStart: 0, zoomStart: 1, lastTap: 0 });
  const [dragX, setDragX] = useState(0);

  const dist = (t: React.TouchList) => {
    const a = t[0], b = t[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const st = touchState.current;
    if (e.touches.length === 2) {
      st.mode = "pinch";
      st.pinchStart = dist(e.touches);
      st.zoomStart = zoom;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - st.lastTap < 300) {
        setZoom((z) => (z > 1 ? 1 : 2));
        setPan({ x: 0, y: 0 });
        st.lastTap = 0;
        st.mode = "none";
        return;
      }
      st.lastTap = now;
      st.startX = e.touches[0].clientX;
      st.startY = e.touches[0].clientY;
      st.startPan = pan;
      st.mode = zoom > 1 ? "pan" : "swipe";
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const st = touchState.current;
    if (st.mode === "pinch" && e.touches.length === 2) {
      const nz = Math.max(1, Math.min(4, st.zoomStart * (dist(e.touches) / st.pinchStart)));
      setZoom(nz);
      if (nz === 1) setPan({ x: 0, y: 0 });
    } else if (st.mode === "pan" && e.touches.length === 1) {
      setPan({
        x: st.startPan.x + (e.touches[0].clientX - st.startX),
        y: st.startPan.y + (e.touches[0].clientY - st.startY),
      });
    } else if (st.mode === "swipe" && e.touches.length === 1) {
      setDragX(e.touches[0].clientX - st.startX);
    }
  };
  const onTouchEnd = () => {
    const st = touchState.current;
    if (st.mode === "swipe") {
      if (dragX > 60 && idx > 0) go(-1);
      else if (dragX < -60 && idx < items.length - 1) go(1);
    }
    setDragX(0);
    st.mode = "none";
  };

  // Mouse drag pan when zoomed
  const mouseDown = useRef<{ x: number; y: number; sp: { x: number; y: number } } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    mouseDown.current = { x: e.clientX, y: e.clientY, sp: pan };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!mouseDown.current) return;
    setPan({
      x: mouseDown.current.sp.x + (e.clientX - mouseDown.current.x),
      y: mouseDown.current.sp.y + (e.clientY - mouseDown.current.y),
    });
  };
  const onMouseUp = () => { mouseDown.current = null; };

  const sender = senders[cur.senderId];
  const senderName = sender?.display_name ?? "Unknown";
  const senderAvatar = sender?.avatar_url ?? undefined;

  const curUrl = urlByKey[cur.key];
  const errored = curUrl === "error";
  const loading = !curUrl;

  const dragTransform = useMemo(
    () => `translate(calc(${pan.x + dragX}px), ${pan.y}px) scale(${zoom})`,
    [pan.x, pan.y, dragX, zoom],
  );

  return (
    <div
      ref={containerRef}
      role="dialog" aria-modal="true"
      className="fixed inset-0 z-[100] bg-black text-white animate-in fade-in duration-150 select-none"
      onWheel={onWheel}
    >
      {/* Header */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center gap-3 px-4 h-14 bg-gradient-to-b from-black/80 to-transparent">
        <Avatar className="size-8">
          <AvatarImage src={senderAvatar} />
          <AvatarFallback className="bg-white/10 text-white text-xs">{initials(senderName)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{senderName}</div>
          <div className="text-[11px] text-white/70">{formatHeader(cur.createdAt)}</div>
        </div>
        <div className="text-sm tabular-nums bg-white/10 rounded-full px-3 py-1">
          {idx + 1} / {items.length}
        </div>
        <button onClick={download} className="p-2 rounded-full hover:bg-white/15" aria-label="Download">
          <Download className="size-5" />
        </button>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/15" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>

      {/* Image stage */}
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={(e) => { if (e.target === e.currentTarget && zoom === 1) onClose(); }}
      >
        {loading && (
          <div className="flex flex-col items-center gap-2 text-white/70">
            <Loader2 className="size-8 animate-spin" />
            <div className="text-sm">Loading image…</div>
          </div>
        )}
        {errored && (
          <div className="flex flex-col items-center gap-3 text-white/80 max-w-sm text-center px-6">
            <AlertTriangle className="size-8 text-yellow-400" />
            <div className="text-base font-semibold">This image is no longer available.</div>
            <button onClick={onClose} className="mt-1 px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-sm">
              Close
            </button>
          </div>
        )}
        {!loading && !errored && (
          <img
            key={cur.key}
            src={curUrl as string}
            alt=""
            draggable={false}
            onDoubleClick={() => { setZoom((z) => (z > 1 ? 1 : 2)); setPan({ x: 0, y: 0 }); }}
            style={{
              transform: dragTransform,
              transition: dragX !== 0 || mouseDown.current ? "none" : "transform 0.2s ease-out",
              cursor: zoom > 1 ? "grab" : "zoom-in",
              maxHeight: "88vh", maxWidth: "94vw",
            }}
            className="object-contain will-change-transform"
          />
        )}
      </div>

      {/* Arrows */}
      {items.length > 1 && (
        <>
          <button
            onClick={() => go(-1)} disabled={idx === 0}
            className={cn(
              "hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 size-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 z-10",
              "disabled:opacity-25 disabled:cursor-not-allowed",
            )}
            aria-label="Previous image"
          >
            <ChevronLeft className="size-7" />
          </button>
          <button
            onClick={() => go(1)} disabled={idx === items.length - 1}
            className={cn(
              "hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 size-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 z-10",
              "disabled:opacity-25 disabled:cursor-not-allowed",
            )}
            aria-label="Next image"
          >
            <ChevronRight className="size-7" />
          </button>
        </>
      )}

      {/* Preload hidden images */}
      <div className="hidden">
        {[idx - 1, idx + 1].map((i) => {
          const it = items[i]; if (!it) return null;
          const u = urlByKey[it.key];
          if (!u || u === "error") return null;
          return <img key={it.key} src={u} alt="" />;
        })}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Download, Loader2, AlertTriangle, Eye } from "lucide-react";
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
  /** Optional badge shown on the image stage (e.g. "Preview Once · Temporary Access"). */
  badge?: string | null;
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

// Spring-ish ease for release animations
const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

const PARALLAX = 0.15;         // incoming image moves 15% slower
const SWIPE_THRESHOLD = 0.28;  // 28% of width
const VELOCITY_THRESHOLD = 0.5; // px/ms flick
const EDGE_RUBBER = 0.35;      // resistance past first/last

export function ChatImageViewer({ items, startKey, senders, resolveUrls, onClose, badge }: Props) {
  const startIdx = Math.max(0, items.findIndex((i) => i.key === startKey));
  const [idx, setIdx] = useState(startIdx);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [urlByKey, setUrlByKey] = useState<Record<string, string | "error">>({});
  const [offset, setOffset] = useState(0); // px offset applied on top of -idx*width
  const urlPromises = useRef<Map<string, Promise<string[]>>>(new Map());
  const stageRef = useRef<HTMLDivElement>(null);
  const stageWidth = useRef(0);
  const animRef = useRef<number | null>(null);
  const chromeVisible = idx >= 0;

  const cur = items[idx];

  // ---------- URL loading + preload ----------
  const getMsgUrls = useCallback((msgId: string) => {
    let p = urlPromises.current.get(msgId);
    if (!p) { p = resolveUrls(msgId); urlPromises.current.set(msgId, p); }
    return p;
  }, [resolveUrls]);

  const loadOne = useCallback(async (i: number) => {
    const it = items[i]; if (!it) return;
    setUrlByKey((m) => {
      if (m[it.key]) return m;
      getMsgUrls(it.msgId)
        .then((urls) => setUrlByKey((mm) => ({ ...mm, [it.key]: urls[it.attIndex] ?? "error" })))
        .catch(() => setUrlByKey((mm) => ({ ...mm, [it.key]: "error" })));
      return m;
    });
  }, [items, getMsgUrls]);

  useEffect(() => {
    for (const off of [0, 1, -1, 2, -2]) {
      const i = idx + off;
      if (i >= 0 && i < items.length) loadOne(i);
    }
  }, [idx, items, loadOne]);

  // Reset zoom on change
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [idx]);

  // ---------- Measure stage ----------
  useEffect(() => {
    const measure = () => { stageWidth.current = stageRef.current?.clientWidth ?? window.innerWidth; };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // ---------- Animation ----------
  const cancelAnim = () => {
    if (animRef.current != null) { cancelAnimationFrame(animRef.current); animRef.current = null; }
  };

  const animateOffset = useCallback((from: number, to: number, duration: number, onDone?: () => void) => {
    cancelAnim();
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = from + (to - from) * easeOutQuint(t);
      setOffset(v);
      if (t < 1) { animRef.current = requestAnimationFrame(step); }
      else { animRef.current = null; onDone?.(); }
    };
    animRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => cancelAnim(), []);

  const go = useCallback((delta: number) => {
    const target = idx + delta;
    if (target < 0 || target >= items.length) return;
    const w = stageWidth.current || window.innerWidth;
    // Animate offset toward -delta*w so the target slide slides in from the correct side,
    // then swap idx and reset offset in the same frame (no flicker).
    animateOffset(offset, -delta * w, 300, () => {
      setIdx(target);
      setOffset(0);
    });
  }, [idx, items.length, offset, animateOffset]);

  const springBack = useCallback(() => {
    animateOffset(offset, 0, 260);
  }, [offset, animateOffset]);

  // ---------- Keyboard + scroll lock ----------
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

  // ---------- Download ----------
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

  // ---------- Wheel zoom ----------
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 30) return;
    setZoom((z) => Math.max(1, Math.min(4, z - e.deltaY * 0.003)));
  };

  // ---------- Pointer-based drag (unified mouse + touch) ----------
  type GestureMode = "none" | "swipe" | "pan" | "pinch";
  const gesture = useRef<{
    mode: GestureMode;
    startX: number; startY: number;
    lastX: number; lastT: number;
    velocity: number;
    startPan: { x: number; y: number };
    pinchStart: number; zoomStart: number;
    pointers: Map<number, { x: number; y: number }>;
    lastTap: number;
    determined: boolean;
  }>({
    mode: "none", startX: 0, startY: 0, lastX: 0, lastT: 0, velocity: 0,
    startPan: { x: 0, y: 0 }, pinchStart: 0, zoomStart: 1,
    pointers: new Map(), lastTap: 0, determined: false,
  });

  const distBetween = (m: Map<number, { x: number; y: number }>) => {
    const [a, b] = Array.from(m.values());
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const rubber = (delta: number) => {
    // Apply resistance if pulling past first/last
    const w = stageWidth.current || window.innerWidth;
    const atStart = idx === 0 && delta > 0;
    const atEnd = idx === items.length - 1 && delta < 0;
    if (!atStart && !atEnd) return delta;
    const sign = Math.sign(delta);
    const mag = Math.abs(delta);
    return sign * (w * EDGE_RUBBER) * (1 - Math.exp(-mag / (w * EDGE_RUBBER)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    cancelAnim();
    const g = gesture.current;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (g.pointers.size === 2) {
      g.mode = "pinch";
      g.pinchStart = distBetween(g.pointers);
      g.zoomStart = zoom;
      return;
    }

    // Double-tap / double-click zoom
    const now = performance.now();
    if (now - g.lastTap < 280) {
      setZoom((z) => (z > 1 ? 1 : 2.2));
      setPan({ x: 0, y: 0 });
      g.lastTap = 0;
      g.mode = "none";
      return;
    }
    g.lastTap = now;

    g.startX = e.clientX;
    g.startY = e.clientY;
    g.lastX = e.clientX;
    g.lastT = now;
    g.velocity = 0;
    g.startPan = pan;
    g.determined = false;
    g.mode = zoom > 1 ? "pan" : "swipe";
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (g.mode === "pinch" && g.pointers.size === 2) {
      const nz = Math.max(1, Math.min(4, g.zoomStart * (distBetween(g.pointers) / g.pinchStart)));
      setZoom(nz);
      if (nz === 1) setPan({ x: 0, y: 0 });
      return;
    }

    if (g.mode === "pan") {
      setPan({ x: g.startPan.x + (e.clientX - g.startX), y: g.startPan.y + (e.clientY - g.startY) });
      return;
    }

    if (g.mode === "swipe") {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (!g.determined) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx) * 1.4) { g.mode = "none"; return; }
        g.determined = true;
      }
      const now = performance.now();
      const dt = Math.max(1, now - g.lastT);
      g.velocity = (e.clientX - g.lastX) / dt;
      g.lastX = e.clientX;
      g.lastT = now;
      setOffset(rubber(dx));
    }
  };

  const endGesture = (e: React.PointerEvent) => {
    const g = gesture.current;
    g.pointers.delete(e.pointerId);
    (e.target as Element).releasePointerCapture?.(e.pointerId);

    if (g.mode === "pinch") {
      if (g.pointers.size < 2) g.mode = "none";
      return;
    }
    if (g.mode === "swipe" && g.determined) {
      const w = stageWidth.current || window.innerWidth;
      const passed = Math.abs(offset) > w * SWIPE_THRESHOLD;
      const flick = Math.abs(g.velocity) > VELOCITY_THRESHOLD && Math.sign(g.velocity) === Math.sign(offset);
      if ((passed || flick) && offset !== 0) {
        const dir = offset > 0 ? -1 : 1;
        if (dir === -1 && idx > 0) go(-1);
        else if (dir === 1 && idx < items.length - 1) go(1);
        else springBack();
      } else {
        springBack();
      }
    } else if (g.mode === "swipe" && !g.determined) {
      // treated as tap on backdrop
      if (zoom === 1 && e.target === e.currentTarget) onClose();
    }
    g.mode = "none";
    g.determined = false;
  };

  const sender = senders[cur.senderId];
  const senderName = sender?.display_name ?? "Unknown";
  const senderAvatar = sender?.avatar_url ?? undefined;

  const stageW = stageWidth.current || (typeof window !== "undefined" ? window.innerWidth : 1);
  const stripTx = -idx * stageW + offset;
  const dragging = gesture.current.mode === "swipe" && gesture.current.determined;
  const panning = gesture.current.mode === "pan";

  // Which slides to render (windowed to ±1)
  const window2 = [idx - 1, idx, idx + 1].filter((i) => i >= 0 && i < items.length);

  return (
    <div
      role="dialog" aria-modal="true"
      className="fixed inset-0 z-[100] bg-black text-white animate-in fade-in duration-150 select-none touch-none"
      onWheel={onWheel}
    >
      {/* Header */}
      {chromeVisible && (
        <div className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-4 h-14 bg-gradient-to-b from-black/80 to-transparent">
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
          <button onClick={download} className="p-2 rounded-full hover:bg-white/15 transition-colors" aria-label="Download">
            <Download className="size-5" />
          </button>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/15 transition-colors" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
      )}

      {badge && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-primary/90 text-primary-foreground text-xs font-medium flex items-center gap-1.5 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          <Eye className="size-3.5" /> {badge}
        </div>
      )}

      {/* Image stage — pointer surface + horizontal strip */}
      <div
        ref={stageRef}
        className="absolute inset-0 overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        style={{ cursor: zoom > 1 ? "grab" : "default" }}
      >
        <div
          className="absolute inset-0 flex will-change-transform"
          style={{
            transform: `translate3d(${stripTx}px, 0, 0)`,
            transition: dragging || animRef.current != null ? "none" : "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
            width: `${items.length * 100}%`,
          }}
        >
          {items.map((it, i) => {
            if (!window2.includes(i)) {
              return <div key={it.key} className="shrink-0" style={{ width: `${100 / items.length}%` }} />;
            }
            const u = urlByKey[it.key];
            const isCur = i === idx;
            // Parallax: incoming/outgoing slides translate slightly opposite to reveal depth.
            // When user drags with `offset`, current moves 100%; neighbors move (1 - PARALLAX)*100%.
            const innerTx = isCur ? 0 : -offset * PARALLAX;
            // Slight fade on current while dragging, subtle darken on neighbors when far away.
            const dragFrac = Math.min(1, Math.abs(offset) / (stageW || 1));
            const opacity = isCur ? Math.max(0.85, 1 - dragFrac * 0.15) : 1;
            return (
              <div
                key={it.key}
                className="shrink-0 h-full flex items-center justify-center relative"
                style={{ width: `${100 / items.length}%` }}
              >
                {!u && (
                  <div className="flex flex-col items-center gap-2 text-white/70">
                    <Loader2 className="size-8 animate-spin" />
                    <div className="text-sm">Loading image…</div>
                  </div>
                )}
                {u === "error" && (
                  <div className="flex flex-col items-center gap-3 text-white/80 max-w-sm text-center px-6">
                    <AlertTriangle className="size-8 text-yellow-400" />
                    <div className="text-base font-semibold">This image is no longer available.</div>
                    <button onClick={onClose} className="mt-1 px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-sm">
                      Close
                    </button>
                  </div>
                )}
                {u && u !== "error" && (
                  <img
                    src={u}
                    alt=""
                    draggable={false}
                    onDoubleClick={() => { if (isCur) { setZoom((z) => (z > 1 ? 1 : 2.2)); setPan({ x: 0, y: 0 }); } }}
                    style={{
                      transform: isCur
                        ? `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`
                        : `translate3d(${innerTx}px, 0, 0)`,
                      transition: isCur && !dragging && !mouseDownPan.current
                        ? "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)"
                        : "none",
                      opacity,
                      maxHeight: "88vh",
                      maxWidth: "94vw",
                      backfaceVisibility: "hidden",
                    }}
                    className="object-contain will-change-transform pointer-events-none"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Arrows */}
      {items.length > 1 && (
        <>
          <button
            onClick={() => go(-1)} disabled={idx === 0}
            className={cn(
              "hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 size-12 items-center justify-center rounded-full",
              "bg-white/10 hover:bg-white/25 z-20 backdrop-blur-md transition-all duration-200 hover:scale-110",
              "disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:scale-100",
            )}
            aria-label="Previous image"
          >
            <ChevronLeft className="size-7" />
          </button>
          <button
            onClick={() => go(1)} disabled={idx === items.length - 1}
            className={cn(
              "hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 size-12 items-center justify-center rounded-full",
              "bg-white/10 hover:bg-white/25 z-20 backdrop-blur-md transition-all duration-200 hover:scale-110",
              "disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:scale-100",
            )}
            aria-label="Next image"
          >
            <ChevronRight className="size-7" />
          </button>
        </>
      )}

      {/* Off-screen decoders for ±2 to keep navigation instantaneous */}
      <div className="hidden" aria-hidden>
        {[idx - 2, idx + 2].map((i) => {
          const it = items[i]; if (!it) return null;
          const u = urlByKey[it.key];
          if (!u || u === "error") return null;
          return <img key={it.key} src={u} alt="" decoding="async" />;
        })}
      </div>
    </div>
  );
}

// mouseDownPan ref shim for the render-time transition check.
// (We only need to know "is the user currently dragging to pan a zoomed image?"
// which is captured by the pointer gesture; we keep this ref for the transition
// gating to avoid interpolating pan updates.)
const mouseDownPan = { current: false as boolean };

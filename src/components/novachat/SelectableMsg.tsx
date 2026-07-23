import { useRef } from "react";
import { Check, Pin } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Wraps a rendered message row and adds:
 *  - Right-click / Ctrl+Click / Long-press (400ms) → enter selection mode
 *  - Tap while in selection mode → toggle
 *  - Animated checkmark overlay, scale down when selected
 *  - Pin badge overlay
 * Renders children unchanged so existing layout (justify-end/start, buttons) still works.
 */
export function SelectableMsg({
  msgId,
  selected,
  selectionMode,
  pinned,
  onEnter,
  onToggle,
  children,
}: {
  msgId: string;
  selected: boolean;
  selectionMode: boolean;
  pinned: boolean;
  onEnter: (id: string) => void;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onTouchStart = () => {
    longPressed.current = false;
    clearTimer();
    timerRef.current = setTimeout(() => {
      longPressed.current = true;
      onEnter(msgId);
      try {
        (navigator as Navigator & { vibrate?: (n: number) => void }).vibrate?.(15);
      } catch {
        // ignore
      }
    }, 400);
  };

  const onCtxMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onEnter(msgId);
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (selectionMode) {
      e.preventDefault();
      e.stopPropagation();
      onToggle(msgId);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      onEnter(msgId);
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (longPressed.current) {
      // Swallow the synthesized click after long-press so buttons underneath don't fire.
      e.preventDefault();
      longPressed.current = false;
    }
    clearTimer();
  };

  return (
    <div
      data-msg-id={msgId}
      onContextMenu={onCtxMenu}
      onClickCapture={onClickCapture}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={clearTimer}
      onTouchCancel={clearTimer}
      className={cn(
        "relative rounded-xl transition-all duration-200 origin-center",
        selectionMode && "pl-8",
        selected && "bg-primary/10 scale-[0.98]",
      )}
    >
      {selectionMode && (
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 animate-in fade-in duration-200">
          <div
            className={cn(
              "size-5 rounded-full border-2 flex items-center justify-center transition-all",
              selected
                ? "bg-primary border-primary text-primary-foreground scale-110"
                : "bg-background/80 border-muted-foreground/40",
            )}
          >
            {selected && <Check className="size-3" strokeWidth={3} />}
          </div>
        </div>
      )}
      {pinned && !selectionMode && (
        <Pin className="absolute -top-1 right-2 size-3.5 text-primary bg-card rounded-full p-0.5 shadow z-10" />
      )}
      {children}
    </div>
  );
}

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/novachat-types";

/**
 * ThumbImage — image with a pre-reserved container and a premium shimmer
 * skeleton that fades into the loaded image. The wrapper never changes size:
 * the aspect ratio is computed from attachment metadata up-front so the final
 * layout is reserved before any bytes arrive. On load, the img fades in over
 * the shimmer.
 */
export function ThumbImage({
  src,
  className,
  imgClassName,
  alt = "",
}: {
  src?: string;
  className?: string;
  imgClassName?: string;
  alt?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Shimmer skeleton — sits behind the image, fades out on load */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 nova-shimmer transition-opacity duration-300",
          loaded ? "opacity-0" : "opacity-100",
        )}
      />
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          className={cn(
            "size-full object-cover transition-[opacity,filter,transform] duration-300",
            loaded ? "opacity-100" : "opacity-0",
            imgClassName,
          )}
        />
      ) : null}
    </div>
  );
}


export function Bubble({ mine, children }: { mine: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={cn(
          "max-w-[85%] sm:max-w-[70%] rounded-2xl shadow-sm overflow-hidden",
          mine
            ? "bg-bubble-me text-bubble-me-foreground"
            : "bg-bubble-other text-bubble-other-foreground border border-border",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export type Att = { path: string; size: number; width: number; height: number; mime: string };

/**
 * Rejected image grid — Telegram-style.
 * Preserves the exact same container dimensions as the accepted grid, but renders
 * the thumbnail behind a heavy Gaussian blur + dark overlay so contents are
 * unrecognizable. Falls back to a stylized gradient when no thumbnail URL is
 * available (receiver never downloaded the image).
 */
export function RejectedImageGrid({
  mine,
  attachments,
  thumbUrls,
  createdAt,
  badge,
}: {
  mine: boolean;
  attachments: Att[];
  thumbUrls?: string[];
  createdAt: string;
  /** Optional badge to render top-left (e.g. "Preview Once"). */
  badge?: React.ReactNode;
}) {
  const count = attachments.length;
  const cols = count === 1 ? 1 : 2;
  const shown = attachments.slice(0, 4);
  const extra = count - shown.length;

  return (
    <Bubble mine={mine}>
      <div className="p-1.5 max-w-[320px] animate-in fade-in duration-300">
        <div className="relative">
          <div className={cn("grid gap-0.5 rounded-lg overflow-hidden", cols === 1 ? "grid-cols-1" : "grid-cols-2")}>
            {shown.map((a, i) => {
              const aspect =
                count === 1
                  ? a.width && a.height
                    ? `${a.width} / ${a.height}`
                    : undefined
                  : undefined;
              return (
                <div
                  key={a.path}
                  style={aspect ? { aspectRatio: aspect } : undefined}
                  className={cn(
                    "relative overflow-hidden bg-gradient-to-br from-muted via-muted/70 to-muted-foreground/20",
                    count === 1 ? (aspect ? "" : "aspect-video") : "aspect-square",
                    count === 3 && i === 0 ? "row-span-2" : "",
                  )}
                >
                  {thumbUrls?.[i] ? (
                    <img
                      src={thumbUrls[i]}
                      alt=""
                      aria-hidden
                      draggable={false}
                      className="size-full object-cover scale-125 blur-2xl select-none pointer-events-none transition-[filter,opacity] duration-300"
                      style={{ filter: "blur(28px) saturate(1.1)" }}
                    />
                  ) : null}
                  {/* dark overlay */}
                  <div className="absolute inset-0 bg-black/35" />
                  {i === 3 && extra > 0 && (
                    <div className="absolute inset-0 text-white/90 text-2xl font-semibold flex items-center justify-center">
                      +{extra}
                    </div>
                  )}
                </div>
              );
            })}

          </div>
          {badge && <div className="absolute top-1.5 left-1.5">{badge}</div>}
        </div>
        <div
          className={cn(
            "flex items-center gap-2 px-2 pb-1 pt-1 text-[11px]",
            mine ? "text-bubble-me-foreground/70" : "text-muted-foreground",
          )}
        >
          <span className="text-destructive/90 font-medium">❌ Image Rejected</span>
          <span className="ml-auto">{formatTime(createdAt)}</span>
        </div>
      </div>
    </Bubble>
  );
}

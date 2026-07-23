import { useState } from "react";
import { cn } from "@/lib/utils";

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

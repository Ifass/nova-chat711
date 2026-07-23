import { cn } from "@/lib/utils";

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

import { cn } from "@/lib/utils";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Personalise";

/**
 * Wordmark. The glyph is three stacked strokes — a nod to a mat, a stave and a
 * schedule all at once, which is about as category-neutral as a mark can get.
 */
export function Logo({
  className,
  tone = "dark",
}: {
  className?: string;
  tone?: "dark" | "light";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "grid h-8 w-8 place-items-center rounded-lg",
          tone === "light" ? "bg-white/15" : "bg-brand-600",
        )}
      >
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
          <g
            stroke={tone === "light" ? "#ffffff" : "#ffffff"}
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          >
            <path d="M5 7h14" />
            <path d="M5 12h9" />
            <path d="M5 17h5" />
          </g>
        </svg>
      </span>
      <span
        className={cn(
          "text-lg font-semibold tracking-tight",
          tone === "light" ? "text-white" : "text-ink",
        )}
      >
        {APP_NAME}
      </span>
    </span>
  );
}

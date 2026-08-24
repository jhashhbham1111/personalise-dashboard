import { cn } from "@/lib/utils";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Personalise";

/**
 * Wordmark.
 *
 * The glyph is three rising strokes — progress through a practice, which stays
 * category-neutral whether the practice is yoga, guitar or cooking. It used to
 * be three *horizontal* strokes of decreasing length, which is precisely the
 * universal hamburger-menu glyph: sitting in the top-left of a header, in a
 * rounded square, it was the thing phone visitors tapped expecting a menu, and
 * it took them to the homepage instead. Turning the strokes upright keeps the
 * mark and frees the affordance for the real menu button beside it.
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
            <path d="M7 18v-4" />
            <path d="M12 18v-8" />
            <path d="M17 18v-12" />
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

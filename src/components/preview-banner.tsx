import { EyeOff } from "lucide-react";

/**
 * Shown on a public page that isn't actually public yet, to the only people
 * who can reach it — its owner and admins.
 *
 * Without it, an instructor previewing their page while unverified sees a
 * perfectly normal-looking public profile and reasonably concludes students
 * can see it too. The whole point of gating on verification is undermined if
 * nobody notices they're gated.
 */
export function PreviewBanner({ reason }: { reason: string }) {
  return (
    <div className="border-b border-accent-300 bg-accent-100">
      <div className="mx-auto flex max-w-5xl items-start gap-2.5 px-4 py-2.5 sm:px-6">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-accent-700" />
        <p className="text-sm text-accent-900">
          <span className="font-medium">Preview.</span> {reason}
        </p>
      </div>
    </div>
  );
}

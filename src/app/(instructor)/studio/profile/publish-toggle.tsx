"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

import { togglePublishedAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

export function PublishToggle({
  isPublished,
  slug,
  canPublish,
  isSuspended = false,
  suspendedReason,
}: {
  isPublished: boolean;
  slug: string;
  canPublish: boolean;
  isSuspended?: boolean;
  suspendedReason?: string | null;
}) {
  const [state, action] = useActionState(togglePublishedAction, emptyState);

  // Suspended accounts get the reason instead of a switch they can't move.
  if (isSuspended) {
    return (
      <Card className="border-danger-300 bg-danger-100 p-5">
        <div className="flex items-start gap-3">
          <EyeOff className="mt-0.5 h-5 w-5 shrink-0 text-danger-700" />
          <div>
            <p className="font-medium text-danger-700">
              Your account is suspended
            </p>
            <p className="mt-0.5 text-sm text-danger-700/80">
              Your page is hidden from students and can&rsquo;t be published.
              Reason given: {suspendedReason ?? "none recorded"}.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={
        isPublished ? "border-brand-200 bg-brand-50 p-5" : "border-accent-300 bg-accent-100 p-5"
      }
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="publish" value={isPublished ? "" : "true"} />

        <FormMessage state={state} />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {isPublished ? (
              <Eye className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            ) : (
              <EyeOff className="mt-0.5 h-5 w-5 shrink-0 text-accent-700" />
            )}
            <div>
              <p
                className={
                  isPublished
                    ? "font-medium text-brand-800"
                    : "font-medium text-accent-700"
                }
              >
                {isPublished ? "Your page is live" : "Your page is hidden"}
              </p>
              <p
                className={
                  isPublished
                    ? "mt-0.5 text-sm text-brand-800/80"
                    : "mt-0.5 text-sm text-accent-700/80"
                }
              >
                {isPublished ? (
                  <>
                    Students can find you in search and book your classes.{" "}
                    <Link href={`/i/${slug}`} className="underline">
                      View it
                    </Link>
                  </>
                ) : canPublish ? (
                  "Nobody can find you yet. Publish when you're ready to take students."
                ) : (
                  "Add at least one class before publishing — an empty page gives students nothing to book."
                )}
              </p>
            </div>
          </div>

          <SubmitButton
            variant={isPublished ? "secondary" : "primary"}
            disabled={!isPublished && !canPublish}
            pendingText={isPublished ? "Hiding…" : "Publishing…"}
          >
            {isPublished ? "Hide my page" : "Publish my page"}
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}

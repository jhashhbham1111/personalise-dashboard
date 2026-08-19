"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button, type ButtonProps } from "./button";

/**
 * Submit button that disables and shows a spinner while its parent <form>'s
 * server action is in flight. Relies on useFormStatus, so it must live *inside*
 * the form element rather than owning it.
 */
export function SubmitButton({
  children,
  pendingText,
  ...props
}: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? (pendingText ?? children) : children}
    </Button>
  );
}

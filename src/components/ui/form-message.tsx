import type { ActionState } from "@/lib/actions";

import { Alert } from "./page";

/** Renders whichever of a server action's error/success messages is present. */
export function FormMessage({
  state,
  className,
}: {
  state: ActionState;
  className?: string;
}) {
  if (state.error) {
    return (
      <Alert tone="danger" className={className}>
        {state.error}
      </Alert>
    );
  }
  if (state.success) {
    return (
      <Alert tone="success" className={className}>
        {state.success}
      </Alert>
    );
  }
  return null;
}

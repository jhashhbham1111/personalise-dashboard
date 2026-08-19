"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { saveVenueAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

type Venue = {
  id: string;
  name: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  landmark: string | null;
  mapUrl: string | null;
};

export function VenueDialog({
  venue,
  triggerLabel = "Add a venue",
  triggerVariant = "primary",
  triggerSize = "md",
  showIcon = false,
}: {
  venue?: Venue;
  triggerLabel?: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
  triggerSize?: "sm" | "md" | "lg";
  showIcon?: boolean;
}) {
  const [state, action] = useActionState(saveVenueAction, emptyState);
  const [open, setOpen] = useState(false);
  const uid = venue?.id ?? "new";

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant={triggerVariant} size={triggerSize}>
          {showIcon ? <Plus className="h-4 w-4" /> : null}
          {triggerLabel}
        </Button>
      }
      title={venue ? "Edit venue" : "Add a venue"}
      description="Students get this address and directions with their booking, so write it the way you'd give it to a friend."
    >
      <form action={action} className="space-y-4">
        {venue ? <input type="hidden" name="venueId" value={venue.id} /> : null}

        <FormMessage state={state} />

        <Field label="Name" htmlFor={`name-${uid}`}>
          <Input
            id={`name-${uid}`}
            name="name"
            defaultValue={venue?.name}
            required
            placeholder="Shanti Studio, Indiranagar"
          />
        </Field>

        <Field label="Street address" htmlFor={`address-${uid}`}>
          <Input
            id={`address-${uid}`}
            name="addressLine"
            defaultValue={venue?.addressLine}
            required
            placeholder="3rd Floor, 412 100 Feet Road"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City" htmlFor={`city-${uid}`} className="sm:col-span-1">
            <Input
              id={`city-${uid}`}
              name="city"
              defaultValue={venue?.city}
              required
              placeholder="Bengaluru"
            />
          </Field>
          <Field label="State" htmlFor={`state-${uid}`}>
            <Input
              id={`state-${uid}`}
              name="state"
              defaultValue={venue?.state}
              placeholder="Karnataka"
            />
          </Field>
          <Field label="PIN code" htmlFor={`pin-${uid}`}>
            <Input
              id={`pin-${uid}`}
              name="pincode"
              defaultValue={venue?.pincode}
              placeholder="560038"
            />
          </Field>
        </div>

        <Field
          label="Landmark"
          htmlFor={`landmark-${uid}`}
          hint="optional, but people find it useful"
        >
          <Input
            id={`landmark-${uid}`}
            name="landmark"
            defaultValue={venue?.landmark ?? ""}
            placeholder="Above the Blue Tokai café"
          />
        </Field>

        <Field label="Map link" htmlFor={`map-${uid}`} hint="optional">
          <Input
            id={`map-${uid}`}
            name="mapUrl"
            type="url"
            defaultValue={venue?.mapUrl ?? ""}
            placeholder="https://maps.google.com/?q=..."
          />
        </Field>

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Cancel</Button>
          </ModalClose>
          <SubmitButton pendingText="Saving…">
            {venue ? "Save venue" : "Add venue"}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

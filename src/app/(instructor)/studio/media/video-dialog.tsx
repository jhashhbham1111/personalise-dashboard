"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { saveVideoAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { VIDEO_TYPE_LABEL, VISIBILITY_LABEL } from "@/lib/enums";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose, useCloseOnSuccess } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

type Video = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  type: string;
  visibility: string;
  thumbnailUrl: string | null;
  durationSec: number | null;
  offeringId: string | null;
};

export function VideoDialog({
  offerings,
  video,
  triggerLabel = "Add a video",
  triggerVariant = "primary",
  triggerSize = "md",
  showIcon = false,
}: {
  offerings: { id: string; title: string }[];
  video?: Video;
  triggerLabel?: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
  triggerSize?: "sm" | "md" | "lg";
  showIcon?: boolean;
}) {
  const [state, action] = useActionState(saveVideoAction, emptyState);
  const [open, setOpen] = useState(false);
  useCloseOnSuccess(state, setOpen);
  const [type, setType] = useState(video?.type ?? "VLOG");
  const uid = video?.id ?? "new";

  // A class recording belongs to a class; a vlog usually doesn't.
  const suggestsOffering = type === "SESSION_RECORDING";

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
      title={video ? "Edit video" : "Add a video"}
      description="Paste a direct link to a video file or an embed URL."
    >
      <form action={action} className="space-y-4">
        {video ? <input type="hidden" name="videoId" value={video.id} /> : null}

        <FormMessage state={state} />

        <Field label="Title" htmlFor={`title-${uid}`} error={state.fields?.title}>
          <Input
            id={`title-${uid}`}
            name="title"
            defaultValue={video?.title}
            required
            placeholder="Five minutes to undo a day at the desk"
          />
        </Field>

        <Field label="Video URL" htmlFor={`url-${uid}`} error={state.fields?.url}>
          <Input
            id={`url-${uid}`}
            name="url"
            type="url"
            defaultValue={video?.url}
            required
            placeholder="https://…/my-class.mp4"
          />
        </Field>

        <Field label="Description" htmlFor={`desc-${uid}`} hint="optional">
          <Textarea
            id={`desc-${uid}`}
            name="description"
            rows={3}
            defaultValue={video?.description ?? ""}
            placeholder="What's in it and who it's for."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind" htmlFor={`type-${uid}`}>
            <Select
              id={`type-${uid}`}
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {Object.entries(VIDEO_TYPE_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Who can watch" htmlFor={`vis-${uid}`}>
            <Select
              id={`vis-${uid}`}
              name="visibility"
              defaultValue={
                video?.visibility ??
                (suggestsOffering ? "ENROLLED_ONLY" : "PUBLIC")
              }
              key={type}
            >
              {Object.entries(VISIBILITY_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Linked class"
            htmlFor={`offering-${uid}`}
            hint="optional"
          >
            <Select
              id={`offering-${uid}`}
              name="offeringId"
              defaultValue={video?.offeringId ?? ""}
            >
              <option value="">Not linked to a class</option>
              {offerings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Length"
            htmlFor={`dur-${uid}`}
            hint="seconds, optional"
          >
            <Input
              id={`dur-${uid}`}
              name="durationSec"
              type="number"
              min={1}
              defaultValue={video?.durationSec ?? ""}
              placeholder="312"
            />
          </Field>
        </div>

        <Field
          label="Thumbnail URL"
          htmlFor={`thumb-${uid}`}
          hint="optional — we draw a placeholder otherwise"
        >
          <Input
            id={`thumb-${uid}`}
            name="thumbnailUrl"
            type="url"
            defaultValue={video?.thumbnailUrl ?? ""}
          />
        </Field>

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Cancel</Button>
          </ModalClose>
          <SubmitButton pendingText="Saving…">
            {video ? "Save video" : "Publish video"}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

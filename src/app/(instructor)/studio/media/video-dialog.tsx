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
import { VideoUpload } from "@/components/ui/video-upload";
import { cn } from "@/lib/utils";

// A Cloudinary URL is what our own upload produces. Anything else editing
// this video arrived as a pasted link, so that's the tab to open on — not
// because upload isn't the default, but because forcing a re-upload just to
// change a title would be a worse edit experience than the URL field it
// replaced.
function looksUploaded(url?: string) {
  return !!url && url.includes("res.cloudinary.com");
}

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
  const [source, setSource] = useState<"upload" | "link">(
    video && !looksUploaded(video.url) ? "link" : "upload",
  );
  // While a file is compressing or uploading, the hidden url input is still
  // empty — hold the submit button disabled so a click there doesn't fail
  // with a confusing "Paste a full video URL" error.
  const [uploadBusy, setUploadBusy] = useState(false);
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
      description="Upload a file, or paste a link if you host it elsewhere."
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

        <div>
          <div className="mb-1.5 flex gap-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => setSource("upload")}
              className={cn(
                "rounded-md px-2.5 py-1 transition-colors",
                source === "upload"
                  ? "bg-brand-100 text-brand-700"
                  : "text-ink-soft hover:bg-canvas",
              )}
            >
              Upload a video
            </button>
            <button
              type="button"
              onClick={() => setSource("link")}
              className={cn(
                "rounded-md px-2.5 py-1 transition-colors",
                source === "link"
                  ? "bg-brand-100 text-brand-700"
                  : "text-ink-soft hover:bg-canvas",
              )}
            >
              Paste a link
            </button>
          </div>

          {source === "upload" ? (
            <VideoUpload
              urlName="url"
              thumbnailName="thumbnailUrl"
              durationName="durationSec"
              defaultUrl={looksUploaded(video?.url) ? video?.url : undefined}
              defaultThumbnailUrl={looksUploaded(video?.url) ? video?.thumbnailUrl : undefined}
              defaultDurationSec={looksUploaded(video?.url) ? video?.durationSec : undefined}
              onBusyChange={setUploadBusy}
            />
          ) : (
            <Field label="Video URL" htmlFor={`url-${uid}`} error={state.fields?.url}>
              <Input
                id={`url-${uid}`}
                name="url"
                type="url"
                defaultValue={!looksUploaded(video?.url) ? video?.url : undefined}
                required
                placeholder="https://…/my-class.mp4 or a YouTube link"
              />
            </Field>
          )}
        </div>

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

          {source === "link" ? (
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
                defaultValue={!looksUploaded(video?.url) ? (video?.durationSec ?? "") : ""}
                placeholder="312"
              />
            </Field>
          ) : null}
        </div>

        {source === "link" ? (
          <Field
            label="Thumbnail URL"
            htmlFor={`thumb-${uid}`}
            hint="optional — we draw a placeholder otherwise"
          >
            <Input
              id={`thumb-${uid}`}
              name="thumbnailUrl"
              type="url"
              defaultValue={!looksUploaded(video?.url) ? (video?.thumbnailUrl ?? "") : ""}
            />
          </Field>
        ) : null}

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Cancel</Button>
          </ModalClose>
          <SubmitButton disabled={uploadBusy} pendingText="Saving…">
            {video ? "Save video" : "Publish video"}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

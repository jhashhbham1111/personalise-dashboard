import "server-only";

import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
  secure: true,
});

export type UploadFolder = "avatars" | "covers";

/**
 * A signature for a video the *browser* uploads directly to Cloudinary.
 *
 * Video can't go through our own /api/upload the way images do: Vercel caps
 * every function's request body at 4.5 MB (platform-wide, not configurable),
 * and a real video is routinely 20-80 MB. Proxying it through our server
 * would just 413 on every upload. So the file bytes go straight from the
 * instructor's browser to Cloudinary, and our server's only job is proving
 * the upload is authorized — by signing the exact parameters Cloudinary will
 * receive. `folder` and `public_id` are baked into the signature itself, so
 * a browser can't redirect its own upload into someone else's namespace by
 * editing the form before it posts.
 */
export function signVideoUpload(instructorId: string): {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
} {
  const { cloudName, apiKey, apiSecret } = env.cloudinary;
  // Every other Cloudinary use in this app fails the same way (a 500 the
  // instructor sees immediately, per the comment at the top of this file) —
  // this throws instead so the API route can turn it into one clear message
  // rather than shipping a signature built from `undefined`.
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary is not configured.");
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = "personalise/videos";
  const publicId = `${instructorId}-${Date.now()}`;

  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, public_id: publicId },
    apiSecret,
  );

  return { cloudName, apiKey, timestamp, signature, folder, publicId };
}

/**
 * Upload a file buffer to Cloudinary and return the secure URL.
 * Files are stored under `personalise/<folder>/` with the given publicId.
 */
export async function uploadImage(
  buffer: Buffer,
  folder: UploadFolder,
  publicId: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `personalise/${folder}`,
        public_id: publicId,
        overwrite: true,
        resource_type: "image",
        transformation: [
          folder === "avatars"
            ? { width: 400, height: 400, crop: "fill", gravity: "face" }
            : { width: 1200, height: 630, crop: "fill" },
        ],
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Upload failed"));
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}

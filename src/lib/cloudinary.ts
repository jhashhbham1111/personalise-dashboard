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

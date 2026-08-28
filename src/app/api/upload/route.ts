import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { uploadImage, UploadFolder } from "@/lib/cloudinary";

const ALLOWED_FOLDERS: UploadFolder[] = ["avatars", "covers"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  const user = await requireUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const file = form.get("file");
  const folder = (form.get("folder")?.toString() ?? "") as UploadFolder;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (!ALLOWED_FOLDERS.includes(folder)) {
    return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Images only" }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Use user id + timestamp as publicId so old images are overwritten cleanly.
  const publicId = `${user.id}-${Date.now()}`;

  try {
    const url = await uploadImage(buffer, folder, publicId);
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

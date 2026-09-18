import { NextResponse } from "next/server";

import { requireInstructor } from "@/lib/auth";
import { signVideoUpload } from "@/lib/cloudinary";

/**
 * Signs a video upload the browser is about to make *directly* to
 * Cloudinary — no video bytes pass through this route, or through Vercel's
 * function layer at all. See the comment on signVideoUpload() for why that
 * split exists. This endpoint's whole job is: confirm the caller is a
 * signed-in instructor, then hand back a signature scoped to their own id.
 */
export async function POST() {
  const user = await requireInstructor().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = signVideoUpload(user.instructorProfileId);
    return NextResponse.json(params);
  } catch {
    return NextResponse.json(
      { error: "Video uploads aren't configured yet. Paste a link instead." },
      { status: 503 },
    );
  }
}

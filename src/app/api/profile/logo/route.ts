import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const LOGO_BUCKET = "profile-logos";
const MAX_BYTES = 1024 * 1024; // 1 MB
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
]);
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided" },
      { status: 400 },
    );
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Please upload a PNG, JPG, or SVG file" },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Logo must be 1 MB or smaller" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Minimal magic-byte check to catch renamed files.
  const looksLikePng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const looksLikeJpg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
  const looksLikeSvg = buffer
    .slice(0, 512)
    .toString("utf8")
    .trim()
    .startsWith("<");

  const validMagic =
    (file.type === "image/png" && looksLikePng) ||
    (file.type === "image/jpeg" && looksLikeJpg) ||
    (file.type === "image/svg+xml" && looksLikeSvg);

  if (!validMagic) {
    return NextResponse.json(
      { error: "We couldn't read that file — please try another" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const ext = EXTENSIONS[file.type];
  const path = `${user.id}/logo.${ext}`;

  // Remove any existing logo at any extension for this user
  await admin.storage
    .from(LOGO_BUCKET)
    .remove([
      `${user.id}/logo.png`,
      `${user.id}/logo.jpg`,
      `${user.id}/logo.svg`,
    ]);

  const { error: uploadError } = await admin.storage
    .from(LOGO_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error("logo upload failed", { userId: user.id, error: uploadError });
    return NextResponse.json(
      { error: "Upload failed — please try again" },
      { status: 500 },
    );
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ logo_url: path, logo_content_type: file.type })
    .eq("id", user.id);

  if (profileError) {
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }

  return NextResponse.json({ logo_url: path, logo_content_type: file.type });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  await admin.storage
    .from(LOGO_BUCKET)
    .remove([
      `${user.id}/logo.png`,
      `${user.id}/logo.jpg`,
      `${user.id}/logo.svg`,
    ]);

  const { error } = await supabase
    .from("profiles")
    .update({ logo_url: null, logo_content_type: null })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to clear logo" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

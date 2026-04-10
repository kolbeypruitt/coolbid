import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

const LOGO_BUCKET = "profile-logos";

/**
 * Download a contractor's logo and return a PNG/JPG buffer suitable for
 * embedding in a @react-pdf/renderer <Image>. SVG sources are rasterized
 * server-side via @resvg/resvg-js.
 *
 * Returns null if no logo is set or if loading fails — callers should
 * fall back to text rendering.
 */
export async function loadContractorLogo(
  profile: ProfileRow,
): Promise<Buffer | null> {
  if (!profile.logo_url) return null;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from(LOGO_BUCKET)
      .download(profile.logo_url);

    if (error || !data) {
      console.error("logo download failed", {
        logoUrl: profile.logo_url,
        error,
      });
      return null;
    }

    const raw = Buffer.from(await data.arrayBuffer());

    if (profile.logo_content_type === "image/svg+xml") {
      const { Resvg } = await import("@resvg/resvg-js");
      return new Resvg(raw, { fitTo: { mode: "width", value: 512 } })
        .render()
        .asPng();
    }

    return raw;
  } catch (err) {
    console.error("logo load threw", { logoUrl: profile.logo_url, err });
    return null;
  }
}

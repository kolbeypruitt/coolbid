import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupShareByToken } from "@/lib/share/lifecycle";
import { renderEstimatePdf } from "@/lib/pdf/render-estimate-pdf";
import { loadContractorLogo } from "@/lib/pdf/load-logo";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type RoomRow = Database["public"]["Tables"]["estimate_rooms"]["Row"];
type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const result = await lookupShareByToken(token);

  if (result.status !== "ok") {
    return NextResponse.json(
      { error: "Not available" },
      { status: 404 },
    );
  }

  const admin = createAdminClient();
  const estimateId = result.share.estimate_id;

  const [
    { data: estimate },
    { data: rooms },
    { data: bom },
  ] = await Promise.all([
    admin.from("estimates").select("*").eq("id", estimateId).maybeSingle(),
    admin.from("estimate_rooms").select("*").eq("estimate_id", estimateId),
    admin
      .from("estimate_bom_items")
      .select("*")
      .eq("estimate_id", estimateId)
      .order("category"),
  ]);

  if (!estimate) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", (estimate as EstimateRow).user_id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  try {
    const logoBuffer = await loadContractorLogo(profile as ProfileRow);
    const pdfBuffer = await renderEstimatePdf({
      estimate: estimate as EstimateRow,
      profile: profile as ProfileRow,
      rooms: (rooms ?? []) as RoomRow[],
      bom: (bom ?? []) as BomRow[],
      logoBuffer,
    });

    const filename = `${((estimate as EstimateRow).project_name || "quote")
      .replace(/[^a-z0-9-_ ]/gi, "")
      .trim()}.pdf`;

    const body = new Uint8Array(pdfBuffer).buffer as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("public pdf render failed", { token, err });
    return new Response("PDF unavailable, please try again shortly.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderEstimatePdf } from "@/lib/pdf/render-estimate-pdf";
import { loadContractorLogo } from "@/lib/pdf/load-logo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: estimate }, { data: profile }, { data: rooms }, { data: bom }] =
    await Promise.all([
      supabase.from("estimates").select("*").eq("id", id).single(),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("estimate_rooms").select("*").eq("estimate_id", id),
      supabase
        .from("estimate_bom_items")
        .select("*")
        .eq("estimate_id", id)
        .order("category"),
    ]);

  if (!estimate || !profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const logoBuffer = await loadContractorLogo(profile);
    const pdfBuffer = await renderEstimatePdf({
      estimate,
      profile,
      rooms: rooms ?? [],
      bom: bom ?? [],
      logoBuffer,
    });

    const filename = `${(estimate.project_name || "estimate")
      .replace(/[^a-z0-9-_ ]/gi, "")
      .trim()}.pdf`;

    return new Response(new Uint8Array(pdfBuffer).buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("pdf render failed", { estimateId: id, err });
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 },
    );
  }
}

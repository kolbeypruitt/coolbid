import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, vendor_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("[GET /api/suppliers]", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

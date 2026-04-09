import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { verifyCronAuth } from "@/lib/cron-auth";
import { syncEmailConnection } from "@/lib/gmail/sync";
import type { Database } from "@/types/database";
import type { EmailConnection } from "@/types/email-connection";

function getServiceClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  // Pick the connection that is due for sync (null last_sync or >15 min ago)
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: connections, error } = await supabase
    .from("email_connections")
    .select("*")
    .or(`last_sync_at.is.null,last_sync_at.lt.${fifteenMinAgo}`)
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(1);

  if (error) {
    console.error("Failed to fetch connections:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  if (!connections || connections.length === 0) {
    return NextResponse.json({ message: "No connections to sync" });
  }

  const connection = connections[0] as EmailConnection;
  const result = await syncEmailConnection(supabase, connection);

  return NextResponse.json({
    connection_id: connection.id,
    processed: result.processed,
    errors: result.errors,
  });
}

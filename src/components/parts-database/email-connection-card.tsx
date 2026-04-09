"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { EmailConnection } from "@/types/email-connection";

type Props = {
  initialConnection: EmailConnection;
  onDisconnect?: () => void;
};

function formatRelative(date: string | null): string {
  if (!date) return "never";
  const ms = Date.now() - new Date(date).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} days ago`;
}

export function EmailConnectionCard({ initialConnection, onDisconnect }: Props) {
  const [connection, setConnection] = useState(initialConnection);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`email_connections:${initialConnection.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "email_connections",
          filter: `id=eq.${initialConnection.id}`,
        },
        (payload) => {
          setConnection(payload.new as EmailConnection);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialConnection.id]);

  async function handleDisconnect() {
    if (!confirm("Disconnect this Gmail account? Existing quotes will remain.")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/auth/gmail/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: connection.id }),
      });
      onDisconnect?.();
    } finally {
      setDisconnecting(false);
    }
  }

  const statusIcon = {
    idle: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    syncing: <Loader2 className="h-4 w-4 animate-spin text-accent-light" />,
    error: <AlertCircle className="h-4 w-4 text-red-500" />,
  }[connection.last_sync_status];

  const statusLabel = {
    idle: "Idle",
    syncing: "Syncing...",
    error: "Error",
  }[connection.last_sync_status];

  const statusClass = {
    idle: "bg-bg-elevated text-txt-secondary",
    syncing: "bg-accent-glow text-accent-light",
    error: "bg-red-950/30 text-red-400",
  }[connection.last_sync_status];

  return (
    <Card className="bg-gradient-card border-border">
      <CardContent className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-accent-light" />
          <div>
            <div className="font-medium text-txt-primary">{connection.email_address}</div>
            <div className="text-xs text-txt-tertiary">
              Last sync: {formatRelative(connection.last_sync_at)}
            </div>
            {connection.last_sync_error && (
              <div
                className="mt-1 text-xs text-red-400"
                title={connection.last_sync_error}
              >
                {connection.last_sync_error.slice(0, 80)}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${statusClass}`}
          >
            {statusIcon}
            {statusLabel}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
          >
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

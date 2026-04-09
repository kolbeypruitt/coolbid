"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EmailConnectButton } from "./email-connect-button";
import { EmailConnectionCard } from "./email-connection-card";
import type { EmailConnection } from "@/types/email-connection";

export function EmailConnectionsSection() {
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("email_connections")
      .select("*")
      .order("connected_at", { ascending: false })
      .then(({ data }) => {
        setConnections((data ?? []) as EmailConnection[]);
        setLoading(false);
      });
  }, []);

  function handleDisconnect(id: string) {
    setConnections((prev) => prev.filter((c) => c.id !== id));
  }

  if (loading) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-txt-primary">Email Connections</h2>
        {connections.length === 0 && <EmailConnectButton />}
      </div>
      {connections.length === 0 ? (
        <div className="rounded-lg border border-border bg-gradient-card p-6 text-center">
          <p className="text-txt-secondary">
            Connect your email to automatically discover supplier quotes.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map((c) => (
            <EmailConnectionCard
              key={c.id}
              initialConnection={c}
              onDisconnect={() => handleDisconnect(c.id)}
            />
          ))}
          <div className="pt-1">
            <EmailConnectButton />
          </div>
        </div>
      )}
    </section>
  );
}

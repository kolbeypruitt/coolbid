import { Snowflake } from "lucide-react";
import type { Database } from "@/types/database";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export function NotAvailable({ profile }: { profile: ProfileRow | null }) {
  const companyName = profile?.company_name?.trim() || "Your HVAC contractor";
  const phone = profile?.company_phone?.trim();
  const email = profile?.company_email?.trim();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-card">
          <Snowflake className="h-8 w-8 text-accent-light" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl font-bold text-txt-primary">
          This proposal isn&rsquo;t available anymore.
        </h1>
        <p className="mt-3 text-txt-secondary">
          Contact {companyName} for an updated copy.
        </p>
        {(phone || email) && (
          <div className="mt-6 space-y-1 text-sm text-txt-secondary">
            {phone && <p>{phone}</p>}
            {email && <p>{email}</p>}
          </div>
        )}
        <p className="mt-10 text-xs text-txt-tertiary">
          Made with coolbid · coolbid.app
        </p>
      </div>
    </main>
  );
}

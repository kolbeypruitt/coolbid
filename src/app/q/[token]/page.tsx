import { Download } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupShareByToken } from "@/lib/share/lifecycle";
import { generateScopeOfWork } from "@/lib/share/scope-of-work";
import { NotAvailable } from "./not-available";
import { AcceptDeclineButtons } from "@/components/share/accept-decline-buttons";
import type { Database } from "@/types/database";

type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type BomRow = Database["public"]["Tables"]["estimate_bom_items"]["Row"];

export const dynamic = "force-dynamic";

export default async function PublicSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await lookupShareByToken(token);

  if (result.status === "not_found") {
    return <NotAvailable profile={null} />;
  }

  const admin = createAdminClient();

  // Fetch estimate + BOM in parallel. If the share was revoked or expired,
  // we still fetch the profile so the not-available view can show contact info.
  const estimateId = result.status === "ok" ? result.share.estimate_id : null;

  const [{ data: estimate }, { data: bomData }] = await Promise.all([
    estimateId
      ? admin.from("estimates").select("*").eq("id", estimateId).maybeSingle()
      : Promise.resolve({ data: null }),
    estimateId
      ? admin
          .from("estimate_bom_items")
          .select("*")
          .eq("estimate_id", estimateId)
          .order("category")
      : Promise.resolve({ data: null }),
  ]);

  if (!estimate) {
    return <NotAvailable profile={null} />;
  }

  const est = estimate as EstimateRow;

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", est.user_id)
    .maybeSingle();

  if (result.status === "revoked" || result.status === "expired") {
    return <NotAvailable profile={(profile as ProfileRow) ?? null} />;
  }

  if (!profile) {
    return <NotAvailable profile={null} />;
  }

  const prof = profile as ProfileRow;
  const bom = (bomData ?? []) as BomRow[];
  const scopeText = est.scope_of_work?.trim() || generateScopeOfWork(est, bom);

  // Signed URL for the logo if one is set
  let logoSignedUrl: string | null = null;
  if (prof.logo_url) {
    const { data: signed } = await admin.storage
      .from("profile-logos")
      .createSignedUrl(prof.logo_url, 3600);
    logoSignedUrl = signed?.signedUrl ?? null;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="relative mx-auto max-w-3xl px-6 py-16">
        {/* Ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[700px] -translate-x-1/2 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(6,182,212,0.14) 0%, transparent 70%)",
          }}
        />

        <article className="relative rounded-2xl border border-border bg-bg-card/70 p-8 shadow-[0_30px_100px_-20px_rgba(6,182,212,0.25)] backdrop-blur-xl sm:p-10">
          {/* Contractor header */}
          <header className="border-b border-border pb-6">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              {logoSignedUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoSignedUrl}
                  alt={`${prof.company_name} logo`}
                  className="max-h-14 max-w-[200px] object-contain"
                />
              )}
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-txt-primary">
                  {prof.company_name?.trim() || "Your HVAC Company"}
                </h1>
                <p className="mt-1 text-sm text-txt-secondary">
                  {[prof.address, prof.state, prof.zip].filter(Boolean).join(" · ")}
                </p>
                <p className="text-sm text-txt-secondary">
                  {[prof.company_phone, prof.company_email].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
          </header>

          {est.estimate_type === 'changeout' && est.existing_system && (
            <section className="mt-6 rounded-lg border border-border bg-bg-card/50 p-4 text-sm text-txt-secondary">
              <span className="text-txt-tertiary">Replacing:</span>{' '}
              {describeExistingSystem(est.existing_system as { system_type?: string; tonnage?: number } | null)}
            </section>
          )}

          {/* Proposal meta */}
          <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetaRow label="Proposal for" value={est.customer_name || "—"} />
            {est.job_address && (
              <MetaRow label="Job address" value={est.job_address} />
            )}
            <MetaRow
              label="Prepared on"
              value={new Date(est.created_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            />
            {est.valid_until && (
              <MetaRow
                label="Valid until"
                value={new Date(est.valid_until).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              />
            )}
          </section>

          {/* Scope */}
          <section className="mt-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-tertiary">
              Scope of work
            </h2>
            <p className="mt-3 text-base leading-relaxed text-txt-primary">
              {scopeText}
            </p>
          </section>

          {/* Itemized BOM (conditional) */}
          {est.display_mode === "itemized" && bom.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-tertiary">
                Included
              </h2>
              <div className="mt-3 overflow-hidden rounded-lg border border-border">
                <table
                  className="w-full text-sm"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  <tbody>
                    {bom.map((item) => (
                      <tr key={item.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-txt-primary">
                          {item.description}
                        </td>
                        <td className="px-4 py-3 text-right text-txt-secondary">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-txt-primary">
                          ${item.total_cost.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Total */}
          <section className="mt-8 flex items-center justify-between rounded-xl border border-b-accent bg-[rgba(6,182,212,0.06)] px-6 py-5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-txt-tertiary">
              Total
            </span>
            <span
              className="text-4xl font-extrabold text-gradient-brand"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              $
              {(est.total_price ?? 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </section>

          {/* Message */}
          {est.note_to_customer && (
            <section className="mt-8 border-t border-border pt-6">
              <p className="italic text-txt-secondary">{est.note_to_customer}</p>
            </section>
          )}

          {/* Accept / Decline */}
          <section className="mt-8">
            <AcceptDeclineButtons token={token} estimateStatus={est.status} />
          </section>

          {/* Download button */}
          <footer className="mt-10 flex flex-col items-center gap-4 border-t border-border pt-6">
            <a
              href={`/q/${token}/pdf`}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-6 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(6,182,212,0.25)] transition-transform hover:-translate-y-0.5"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </a>
            <p className="text-xs text-txt-tertiary">
              Made with coolbid · coolbid.app
            </p>
          </footer>
        </article>
      </div>
    </main>
  );
}

function describeExistingSystem(es: { system_type?: string; tonnage?: number } | null | undefined): string {
  if (!es) return 'existing system';
  const parts: string[] = [];
  if (es.tonnage) parts.push(`${es.tonnage} ton`);
  if (es.system_type) {
    const labels: Record<string, string> = {
      heat_pump: 'heat pump',
      gas_ac: 'gas furnace + AC',
      dual_fuel: 'dual-fuel system',
      electric: 'air handler with heat strips',
      ac_only: 'AC-only system',
    };
    parts.push(labels[es.system_type] ?? es.system_type);
  }
  return parts.length ? parts.join(' ') : 'existing system';
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-txt-tertiary">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-txt-primary">{value}</div>
    </div>
  );
}

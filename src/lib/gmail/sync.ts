import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { EmailConnection } from "@/types/email-connection";
import { refreshAccessToken } from "./oauth";
import { listMessages, getMessage } from "./client";
import { buildGmailSearchQuery } from "./search";
import { extractEmailContent } from "./parse";
import { parseQuoteContent } from "@/lib/hvac/parse-quote";
import { checkAiActionLimit, incrementAiActionCount } from "@/lib/billing/ai-action-counter";

const MAX_MESSAGES_PER_SYNC = 5;

type Client = SupabaseClient<Database>;

export async function syncEmailConnection(
  supabase: Client,
  connection: EmailConnection
): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  await supabase
    .from("email_connections")
    .update({ last_sync_status: "syncing" })
    .eq("id", connection.id);

  try {
    // Refresh token if expiring within 5 minutes
    let accessToken = connection.access_token;
    const expiresAt = new Date(connection.expires_at).getTime();
    if (expiresAt < Date.now() + 5 * 60 * 1000) {
      const refreshed = await refreshAccessToken(connection.refresh_token);
      accessToken = refreshed.access_token;
      await supabase
        .from("email_connections")
        .update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        })
        .eq("id", connection.id);
    }

    // Fetch supplier domains for this user
    const { data: domains } = await supabase
      .from("supplier_email_domains")
      .select("domain")
      .eq("user_id", connection.user_id);

    if (!domains || domains.length === 0) {
      await supabase
        .from("email_connections")
        .update({
          last_sync_status: "idle",
          last_sync_at: new Date().toISOString(),
          last_sync_error: "No supplier domains configured",
        })
        .eq("id", connection.id);
      return { processed: 0, errors: ["No supplier domains configured"] };
    }

    const query = buildGmailSearchQuery({
      domains: domains.map((d) => d.domain),
      daysBack: connection.initial_sync_days,
    });

    const messages = await listMessages(accessToken, query, 20);

    if (messages.length === 0) {
      await supabase
        .from("email_connections")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "idle",
          last_sync_error: null,
        })
        .eq("id", connection.id);
      return { processed: 0, errors: [] };
    }

    // Filter out already-processed messages
    const messageIds = messages.map((m) => m.id);
    const { data: existingQuotes } = await supabase
      .from("quotes")
      .select("source_email_id")
      .eq("user_id", connection.user_id)
      .in("source_email_id", messageIds);

    const seenIds = new Set(
      (existingQuotes ?? []).map((q) => q.source_email_id).filter(Boolean)
    );

    const newMessages = messages
      .filter((m) => !seenIds.has(m.id))
      .slice(0, MAX_MESSAGES_PER_SYNC);

    for (const messageRef of newMessages) {
      // Check AI action limit before each parse
      const limitCheck = await checkAiActionLimit(supabase, connection.user_id);
      if (!limitCheck.allowed) {
        errors.push(`AI action limit reached — subscribe to continue syncing`);
        break;
      }

      try {
        const fullMessage = await getMessage(accessToken, messageRef.id);
        const extracted = await extractEmailContent(accessToken, fullMessage);

        let parsed;
        let sourceType: "email_attachment" | "email_body";

        if (extracted.attachments.length > 0) {
          // PDF attachments: pass as images (Claude Vision)
          parsed = await parseQuoteContent({
            type: "images",
            images: extracted.attachments.map((a, i) => ({
              base64: a.base64,
              mediaType: "image/jpeg" as const,
              pageNum: i + 1,
            })),
          });
          sourceType = "email_attachment";
        } else if (extracted.bodyText.length > 100) {
          // Email body text: pass as text
          parsed = await parseQuoteContent({
            type: "text",
            text: extracted.bodyText,
          });
          sourceType = "email_body";
        } else {
          // Skip messages with no useful content
          continue;
        }

        // Insert quote record
        const { data: quote, error: quoteError } = await supabase
          .from("quotes")
          .insert({
            user_id: connection.user_id,
            quote_number: parsed.quote_number || "",
            quote_date: parsed.quote_date || null,
            subtotal: parsed.subtotal,
            tax: parsed.tax,
            total: parsed.total,
            file_name: extracted.attachments[0]?.filename || "email-body.txt",
            status: "parsed",
            source_type: sourceType,
            source_email_id: extracted.messageId,
            source_email_subject: extracted.subject,
            source_email_from: extracted.from,
            source_email_date: extracted.date
              ? new Date(extracted.date).toISOString()
              : null,
          })
          .select("id")
          .single();

        if (quoteError || !quote) {
          errors.push(`Quote insert failed: ${quoteError?.message ?? "unknown"}`);
          continue;
        }

        // Insert quote line items
        const lineInserts = parsed.line_items.map((item) => ({
          quote_id: quote.id,
          model_number: item.model_number,
          description: item.description,
          equipment_type: item.equipment_type,
          brand: item.brand,
          tonnage: item.tonnage,
          seer_rating: item.seer_rating,
          btu_capacity: item.btu_capacity,
          stages: item.stages,
          refrigerant_type: item.refrigerant_type,
          quantity: item.quantity,
          unit_price: item.unit_price,
          extended_price: item.extended_price,
          selected: true,
        }));

        if (lineInserts.length > 0) {
          await supabase.from("quote_lines").insert(lineInserts);
        }

        if (limitCheck.shouldIncrement) {
          await incrementAiActionCount(supabase, connection.user_id);
        }

        processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Message ${messageRef.id}: ${msg}`);
        console.error(`Failed to process message ${messageRef.id}:`, err);
      }
    }

    // Update connection state after sync
    await supabase
      .from("email_connections")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: errors.length > 0 ? "error" : "idle",
        last_sync_error:
          errors.length > 0 ? errors.join("; ").slice(0, 500) : null,
      })
      .eq("id", connection.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("email_connections")
      .update({
        last_sync_status: "error",
        last_sync_error: msg.slice(0, 500),
      })
      .eq("id", connection.id);
    errors.push(msg);
  }

  return { processed, errors };
}

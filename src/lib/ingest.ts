import "server-only";
import { after } from "next/server";
import { supabase } from "./supabase";
import { deriveKind, type MessageEvent, type Part } from "./types";
import { react } from "./linq";
import { enrich } from "./enrich";

/** Best text to display before enrichment runs. */
function pickRawText(parts: Part[]): string | null {
  for (const p of parts) {
    if (p.type === "text") return p.value;
  }
  return null;
}

function pickSourceUrl(parts: Part[]): string | null {
  for (const p of parts) {
    if (p.type === "link") return p.value;
  }
  return null;
}

function pickMediaUrl(parts: Part[]): string | null {
  for (const p of parts) {
    if (p.type === "media" && p.url) return p.url;
  }
  return null;
}

/**
 * Process one Linq message.received event:
 *   1. Insert a saves row (idempotent on linq_message_id).
 *   2. ✅-react inline so the user sees confirmation fast.
 *   3. Schedule enrichment via after() so the webhook acks quickly.
 */
export async function ingest(event: MessageEvent): Promise<void> {
  const { data } = event;
  if (!data.chat?.id) return;

  // Skip outbound (our own bot) messages.
  if (data.direction === "outbound") return;

  const kind = deriveKind(data.parts);
  const raw_text = pickRawText(data.parts);
  const source_url = pickSourceUrl(data.parts);
  const media_url = pickMediaUrl(data.parts);

  const { data: inserted, error } = await supabase
    .from("saves")
    .upsert(
      {
        couple_id: data.chat.id,
        linq_message_id: data.id,
        sender_handle: data.sender_handle,
        kind,
        raw_text,
        source_url,
        media_url,
      },
      { onConflict: "linq_message_id" }
    )
    .select("id, kind, source_url, media_url, raw_text")
    .single();

  if (error) {
    console.error("[ingest] insert failed", error);
    return;
  }

  // Silent ✅ confirmation. Don't fail the whole pipeline if it errors.
  after(async () => {
    try {
      await react(data.id, "✅");
    } catch (e) {
      console.error("[ingest] react failed", e);
    }
  });

  // Enrichment (Whisper / OG-unfurl / embed) — runs after response is sent.
  after(async () => {
    try {
      await enrich(inserted.id);
    } catch (e) {
      console.error("[ingest] enrich failed", e);
    }
  });
}

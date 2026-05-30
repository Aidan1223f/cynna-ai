import "server-only";
import { after } from "next/server";
import { supabase } from "./supabase";
import { deriveKind, type PhotonEvent, type Part } from "./types";
import { reactToMessage } from "./photon";
import { enrich } from "./enrich";

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

/** Decode a base64 media part to an ArrayBuffer for Whisper / future enrichers. */
export function pickMediaBuffer(parts: Part[]): { buf: ArrayBuffer; mime: string } | null {
  for (const p of parts) {
    if (p.type === "media" && p.data_base64) {
      const bin = Buffer.from(p.data_base64, "base64");
      const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
      return { buf: ab, mime: p.mime_type ?? "application/octet-stream" };
    }
  }
  return null;
}

/**
 * Process one Photon `message.received` event:
 *   1. Resolve space_id → couple_id (via couples.photon_space_id).
 *   2. Insert a saves row (idempotent on photon_message_id).
 *   3. ✅-react inline so the user sees confirmation fast.
 *   4. Schedule enrichment via after() so the webhook acks quickly.
 *
 * Pairing-code messages (PAIR-XXXX) are handled in the worker before this
 * is ever called, so by the time we're here the space is a known couple.
 */
export async function ingest(event: PhotonEvent): Promise<void> {
  if (event.event_type !== "message.received") return;

  // Resolve which couple this space belongs to.
  const { data: couple, error: coupleErr } = await supabase
    .from("couples")
    .select("id")
    .eq("photon_space_id", event.space_id)
    .maybeSingle();

  if (coupleErr) {
    console.error("[ingest] couple lookup failed", coupleErr);
    return;
  }
  if (!couple) {
    console.warn("[ingest] no couple for space", event.space_id);
    return;
  }

  const kind = deriveKind(event.parts);
  const raw_text = pickRawText(event.parts);
  const source_url = pickSourceUrl(event.parts);
  const media = pickMediaBuffer(event.parts);

  // For now, media bytes only round-trip into Whisper inside enrich(); we
  // don't persist them to object storage on day 1. Stash a placeholder so
  // the dashboard can show "voice note" without a URL.
  const media_url = media ? `inline:${event.message_id}` : null;

  const { data: inserted, error } = await supabase
    .from("saves")
    .upsert(
      {
        couple_id: couple.id,
        photon_message_id: event.message_id,
        sender_handle: event.sender_handle,
        kind,
        raw_text,
        source_url,
        media_url,
      },
      { onConflict: "photon_message_id" }
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
      await reactToMessage(event.message_id, "✅");
    } catch (e) {
      console.error("[ingest] react failed", e);
    }
  });

  // Enrichment runs asynchronously after the webhook returns 200.
  after(async () => {
    try {
      await enrich(inserted.id, media);
    } catch (e) {
      console.error("[ingest] enrich failed", e);
    }
  });
}

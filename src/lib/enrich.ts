import "server-only";
import { supabase } from "./supabase";
import { embed, transcribe } from "./openai";
import { downloadMedia } from "./linq";
import { classifyUrl } from "./sources";
import { unfurl } from "./unfurl";
import { extractAppleMaps, type Place } from "./extractors/apple-maps";
import { classifySubject } from "./classify-subject";

type EnrichableRow = {
  id: string;
  couple_id: string;
  kind: "text" | "link" | "image" | "voice" | "video" | "place";
  raw_text: string | null;
  source_url: string | null;
  media_url: string | null;
  transcript: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  source_provider: string | null;
  place: Place | null;
  subject_id: string | null;
};

/** Idempotently upsert a subject by (couple_id, name) and return its id. */
async function getOrCreateSubject(
  coupleId: string,
  name: string
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data: existing } = await supabase
    .from("subjects")
    .select("id")
    .eq("couple_id", coupleId)
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase
    .from("subjects")
    .insert({ couple_id: coupleId, name: trimmed })
    .select("id")
    .single();
  if (error) {
    console.error("[enrich] subject insert failed", error);
    return null;
  }
  return created.id as string;
}

async function listSubjectNames(coupleId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("subjects")
    .select("name")
    .eq("couple_id", coupleId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data.map((r) => r.name as string);
}

/**
 * Fill in transcript / og_* / place / subject_id / embedding for a save row.
 * Idempotent — safe to re-run; uses the row's current state to decide what to do.
 */
export async function enrich(saveId: string): Promise<void> {
  const { data: row, error } = await supabase
    .from("saves")
    .select(
      "id, couple_id, kind, raw_text, source_url, media_url, transcript, og_title, og_description, og_image, source_provider, place, subject_id"
    )
    .eq("id", saveId)
    .single<EnrichableRow>();
  if (error || !row) {
    console.error("[enrich] load failed", error);
    return;
  }

  const updates: Record<string, unknown> = {};

  // 1) Voice → Whisper.
  if (row.kind === "voice" && row.media_url && !row.transcript) {
    try {
      const { buf, mime } = await downloadMedia(row.media_url);
      const text = await transcribe(buf, mime, "voice.m4a");
      if (text) updates.transcript = text;
    } catch (e) {
      console.error("[enrich] transcribe failed", e);
    }
  }

  // 2) Link → classify + unfurl + provider-specific extract.
  let resolvedKind: EnrichableRow["kind"] = row.kind;
  let resolvedProvider: string | null = row.source_provider;

  if (row.source_url && !row.og_title && !row.place) {
    const classified = classifyUrl(row.source_url);
    if (classified) {
      resolvedProvider = classified.provider;
      updates.source_provider = classified.provider;

      if (classified.provider === "apple_maps") {
        const place = extractAppleMaps(row.source_url);
        if (place) {
          updates.place = place;
          updates.kind = "place";
          resolvedKind = "place";
          if (place.name) updates.og_title = place.name;
          if (place.address) updates.og_description = place.address;
        }
      } else {
        const u = await unfurl(row.source_url);
        if (u.title) updates.og_title = u.title;
        if (u.description) updates.og_description = u.description;
        if (u.image) updates.og_image = u.image;
        if (classified.content === "video") {
          updates.kind = "video";
          resolvedKind = "video";
        }
      }
    }
  }

  // 3) Subject classification — only if we have meaningful text and no subject yet.
  const subjectText =
    (updates.transcript as string | undefined) ??
    row.transcript ??
    row.raw_text ??
    (updates.og_title as string | undefined) ??
    row.og_title ??
    (updates.og_description as string | undefined) ??
    row.og_description ??
    "";

  if (!row.subject_id && subjectText.trim().length > 0) {
    try {
      const existing = await listSubjectNames(row.couple_id);
      const guess = await classifySubject({
        text: subjectText,
        provider: resolvedProvider,
        existing,
      });
      if (guess?.name) {
        const subjectId = await getOrCreateSubject(row.couple_id, guess.name);
        if (subjectId) updates.subject_id = subjectId;
      }
    } catch (e) {
      console.error("[enrich] subject classify failed", e);
    }
  }

  // 4) Embed the best text we have.
  const embedCandidate =
    subjectText ||
    (updates.og_title as string | undefined) ||
    row.source_url ||
    "";
  if (embedCandidate) {
    try {
      const vec = await embed(embedCandidate);
      if (vec) updates.embedding = vec;
    } catch (e) {
      console.error("[enrich] embed failed", e);
    }
  }

  // Suppress no-op writes.
  if (Object.keys(updates).length === 0) return;
  // resolvedKind is captured above for downstream callers; not written separately.
  void resolvedKind;

  const { error: updErr } = await supabase.from("saves").update(updates).eq("id", saveId);
  if (updErr) console.error("[enrich] update failed", updErr);
}

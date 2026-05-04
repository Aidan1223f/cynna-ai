import "server-only";
import { supabase } from "./supabase";
import { embed, transcribe } from "./openai";

type EnrichableRow = {
  id: string;
  kind: "text" | "link" | "image" | "voice";
  raw_text: string | null;
  source_url: string | null;
  media_url: string | null;
  transcript: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
};

/** Quick-and-dirty OG meta extractor. No HTML parser; deliberate v1 shortcut. */
function pluck(html: string, regex: RegExp): string | null {
  const m = html.match(regex);
  return m ? m[1].trim() : null;
}

async function unfurl(url: string): Promise<{
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
}> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0 (cynna-bot)" },
      redirect: "follow",
    });
    if (!res.ok) return { og_title: null, og_description: null, og_image: null };
    const html = (await res.text()).slice(0, 200_000);
    return {
      og_title:
        pluck(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
        pluck(html, /<title>([^<]+)<\/title>/i),
      og_description: pluck(
        html,
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
      ),
      og_image: pluck(
        html,
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
      ),
    };
  } catch {
    return { og_title: null, og_description: null, og_image: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fill in transcript / og_* / embedding for a save row.
 * Idempotent — safe to re-run; uses the row's current state to decide what to do.
 *
 * `media` is an inline buffer the worker already pulled from Spectrum. We
 * don't persist it; we only feed it through Whisper. If null and the row
 * is a voice note, we skip transcription (re-runs of enrich() therefore
 * can't recover transcripts for old saves — acceptable for day 1).
 */
export async function enrich(
  saveId: string,
  media?: { buf: ArrayBuffer; mime: string } | null
): Promise<void> {
  const { data: row, error } = await supabase
    .from("saves")
    .select("id, kind, raw_text, source_url, media_url, transcript, og_title, og_description, og_image")
    .eq("id", saveId)
    .single<EnrichableRow>();
  if (error || !row) {
    console.error("[enrich] load failed", error);
    return;
  }

  const updates: Record<string, unknown> = {};

  // 1) Voice → Whisper. Uses the inline buffer the worker handed us; we
  //    don't fetch from a URL because Spectrum delivers bytes directly.
  if (row.kind === "voice" && media && !row.transcript) {
    try {
      const text = await transcribe(media.buf, media.mime, "voice.m4a");
      if (text) updates.transcript = text;
    } catch (e) {
      console.error("[enrich] transcribe failed", e);
    }
  }

  // 2) Link → OG unfurl.
  if (row.kind === "link" && row.source_url && !row.og_title) {
    const og = await unfurl(row.source_url);
    if (og.og_title) updates.og_title = og.og_title;
    if (og.og_description) updates.og_description = og.og_description;
    if (og.og_image) updates.og_image = og.og_image;
  }

  // 3) Embed the best text we have.
  const candidate =
    (updates.transcript as string | undefined) ??
    row.transcript ??
    row.raw_text ??
    (updates.og_title as string | undefined) ??
    row.og_title ??
    (updates.og_description as string | undefined) ??
    row.og_description ??
    row.source_url ??
    "";
  if (candidate) {
    try {
      const vec = await embed(candidate);
      if (vec) updates.embedding = vec;
    } catch (e) {
      console.error("[enrich] embed failed", e);
    }
  }

  if (Object.keys(updates).length === 0) return;

  const { error: updErr } = await supabase.from("saves").update(updates).eq("id", saveId);
  if (updErr) console.error("[enrich] update failed", updErr);
}

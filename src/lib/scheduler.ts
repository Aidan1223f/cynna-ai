import "server-only";
import { supabase } from "./supabase";
import { sendMessage } from "./linq";
import { compose } from "./voice";

/**
 * Substrate for proactive (Poke-style) messaging.
 * Handlers compose a message in voice (see voice.ts) and send via Linq.
 */

export type TriggerKind = "daily_recall" | "weekly_date_idea";

export async function enqueue(
  coupleId: string,
  kind: TriggerKind,
  fireAt: Date,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await supabase.from("triggers").insert({
    couple_id: coupleId,
    kind,
    fire_at: fireAt.toISOString(),
    payload,
  });
  if (error) console.error("[scheduler] enqueue failed", error);
}

/** Compute next 9am UTC after `from` (couple-local tz comes day 2). */
export function nextDailyFire(from: Date = new Date()): Date {
  const next = new Date(from);
  next.setUTCHours(9, 0, 0, 0);
  if (next <= from) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** Compute next Friday at 4pm UTC after `from`. */
export function nextFridayFire(from: Date = new Date()): Date {
  const next = new Date(from);
  next.setUTCHours(16, 0, 0, 0);
  // 0 = Sun ... 5 = Fri
  const daysUntilFri = (5 - next.getUTCDay() + 7) % 7;
  if (daysUntilFri === 0 && next <= from) {
    next.setUTCDate(next.getUTCDate() + 7);
  } else {
    next.setUTCDate(next.getUTCDate() + daysUntilFri);
  }
  return next;
}

type Handler = (coupleId: string, payload: Record<string, unknown>) => Promise<void>;

/** Pull names + a recent surfaceable save. Tiny v1 — refine as we learn. */
async function buildDailyRecallContext(coupleId: string): Promise<string | null> {
  const { data: couple } = await supabase
    .from("couples")
    .select("partner_a, partner_b")
    .eq("id", coupleId)
    .single();
  if (!couple) return null;

  const { data: save } = await supabase
    .from("saves")
    .select("sender_handle, kind, raw_text, og_title, transcript, created_at")
    .eq("couple_id", coupleId)
    .order("created_at", { ascending: false })
    .range(3, 3) // skip the most recent few; recall is for older stuff
    .maybeSingle();
  if (!save) return null;

  const summary =
    save.og_title ?? save.transcript ?? save.raw_text ?? `a ${save.kind}`;
  const ageDays = Math.max(
    1,
    Math.round((Date.now() - new Date(save.created_at).getTime()) / 86_400_000)
  );
  return `Couple: ${couple.partner_a} & ${couple.partner_b}. Save from ${ageDays} days ago: ${save.sender_handle} sent "${summary}".`;
}

async function buildWeeklyDateContext(coupleId: string): Promise<string | null> {
  const { data: couple } = await supabase
    .from("couples")
    .select("partner_a, partner_b")
    .eq("id", coupleId)
    .single();
  if (!couple) return null;

  const { data: saves } = await supabase
    .from("saves")
    .select("sender_handle, kind, raw_text, og_title, source_url, created_at")
    .eq("couple_id", coupleId)
    .in("kind", ["link", "text"])
    .order("created_at", { ascending: false })
    .limit(8);
  if (!saves || saves.length === 0) return null;

  const list = saves
    .map((s) => `- ${s.sender_handle}: ${s.og_title ?? s.raw_text ?? s.source_url}`)
    .join("\n");
  return `Couple: ${couple.partner_a} & ${couple.partner_b}. Recent saves to choose from:\n${list}`;
}

const kindHandlers: Record<TriggerKind, Handler> = {
  daily_recall: async (coupleId) => {
    const ctx = await buildDailyRecallContext(coupleId);
    if (!ctx) return;
    const reply = await compose("daily_recall", ctx);
    if (!reply) return;
    await sendMessage(coupleId, [{ type: "text", value: reply }]);
  },
  weekly_date_idea: async (coupleId) => {
    const ctx = await buildWeeklyDateContext(coupleId);
    if (!ctx) return;
    const reply = await compose("weekly_date_idea", ctx);
    if (!reply) return;
    await sendMessage(coupleId, [{ type: "text", value: reply }]);
  },
};

/** Drain due triggers. Called by a cron driver in day 2; safe to call manually for testing. */
export async function runDue(now: Date = new Date()): Promise<{ ran: number }> {
  const { data, error } = await supabase
    .from("triggers")
    .select("id, couple_id, kind, payload")
    .is("fired_at", null)
    .lte("fire_at", now.toISOString())
    .limit(100);

  if (error) {
    console.error("[scheduler] runDue select failed", error);
    return { ran: 0 };
  }
  if (!data || data.length === 0) return { ran: 0 };

  let ran = 0;
  for (const row of data) {
    const handler = kindHandlers[row.kind as TriggerKind];
    if (!handler) {
      console.warn("[scheduler] unknown kind", row.kind);
      continue;
    }
    try {
      await handler(row.couple_id, row.payload ?? {});
      await supabase
        .from("triggers")
        .update({ fired_at: new Date().toISOString() })
        .eq("id", row.id);
      ran++;
    } catch (e) {
      console.error("[scheduler] handler failed", row.id, e);
    }
  }
  return { ran };
}

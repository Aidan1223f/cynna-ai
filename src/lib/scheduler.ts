import "server-only";
import { supabase } from "./supabase";

/**
 * Substrate for proactive (Poke-style) messaging.
 * Day 1: handlers are no-op stubs that just mark fired_at.
 * Day 2: fill `kindHandlers` with real `photon.sendText` calls.
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

const kindHandlers: Record<TriggerKind, Handler> = {
  // Day-1 stubs. Day-2: pick a save, format a friendly message, call linq.sendMessage.
  daily_recall: async (coupleId) => {
    console.log("[scheduler] (stub) daily_recall for", coupleId);
  },
  weekly_date_idea: async (coupleId) => {
    console.log("[scheduler] (stub) weekly_date_idea for", coupleId);
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

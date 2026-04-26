import { z } from "zod";
import { createChat } from "@/lib/linq";
import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";
import {
  enqueue,
  nextDailyFire,
  nextFridayFire,
} from "@/lib/scheduler";

const E164 = /^\+[1-9]\d{6,14}$/;

const Body = z.object({
  partnerA: z.string().regex(E164, "partnerA must be E.164 (e.g. +14155551234)"),
  partnerB: z.string().regex(E164, "partnerB must be E.164"),
});

const HELLO =
  "hi 👋 — i'm your shared memory. forward me anything you both want to remember and i'll keep it for you.";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { partnerA, partnerB } = parsed.data;
  if (partnerA === partnerB) {
    return Response.json({ error: "partners must have different numbers" }, { status: 400 });
  }

  // 1) Create the iMessage group via Linq (bot + both partners).
  let chatId: string | undefined;
  try {
    const chat = await createChat({ to: [partnerA, partnerB], message: HELLO });
    chatId = chat.chat?.id ?? (chat.id as string | undefined);
  } catch (e) {
    console.error("[onboarding] createChat failed", e);
    return Response.json({ error: "failed to create iMessage group" }, { status: 502 });
  }

  if (!chatId) {
    return Response.json({ error: "linq did not return a chat id" }, { status: 502 });
  }

  // 2) Persist the couple row.
  const { error: insertErr } = await supabase
    .from("couples")
    .upsert({ id: chatId, partner_a: partnerA, partner_b: partnerB });
  if (insertErr) {
    console.error("[onboarding] couples insert failed", insertErr);
    return Response.json({ error: "failed to save couple" }, { status: 500 });
  }

  // 3) Schedule the recurring proactive messages (handlers are stubs day 1).
  await enqueue(chatId, "daily_recall", nextDailyFire());
  await enqueue(chatId, "weekly_date_idea", nextFridayFire());

  return Response.json({
    coupleId: chatId,
    dashboardUrl: `${env.PUBLIC_BASE_URL}/${encodeURIComponent(chatId)}`,
  });
}

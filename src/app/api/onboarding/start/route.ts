import { z } from "zod";
import { randomBytes } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";

const E164 = /^\+[1-9]\d{6,14}$/;

const Body = z.object({
  partnerA: z.string().regex(E164, "partnerA must be E.164 (e.g. +14155551234)"),
  partnerB: z.string().regex(E164, "partnerB must be E.164"),
});

/** Crockford base32 (no I/L/O/U) — 4 chars ≈ 1M codes; collisions handled below. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function generateCode(): string {
  const bytes = randomBytes(4);
  let out = "";
  for (let i = 0; i < 4; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `PAIR-${out}`;
}

const PAIRING_TTL_MS = 60 * 60 * 1000; // 1 hour

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

  // Generate a unique-ish pairing code with up to 5 retries on collision.
  let code = "";
  let lastErr: unknown = null;
  for (let i = 0; i < 5; i++) {
    code = generateCode();
    const expires_at = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
    const { error } = await supabase.from("pairings").insert({
      code,
      partner_a: partnerA,
      partner_b: partnerB,
      expires_at,
    });
    if (!error) {
      lastErr = null;
      break;
    }
    lastErr = error;
    // Postgres unique-violation is 23505; retry on collision.
    if ((error as { code?: string }).code !== "23505") break;
  }
  if (lastErr) {
    console.error("[onboarding] pairing insert failed", lastErr);
    return Response.json({ error: "failed to start pairing" }, { status: 500 });
  }

  return Response.json({
    code,
    botNumber: env.BOT_DISPLAY_NUMBER,
    expiresInSeconds: Math.floor(PAIRING_TTL_MS / 1000),
  });
}

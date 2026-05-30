import "server-only";
import { randomBytes } from "node:crypto";
import { supabase } from "./supabase";
import { env } from "./env";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function generateToken(coupleId: string, phone: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expires_at = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const { error } = await supabase.from("auth_tokens").insert({
    token,
    couple_id: coupleId,
    phone,
    expires_at,
  });
  if (error) throw new Error(`Failed to create auth token: ${error.message}`);
  return token;
}

export async function validateSession(
  token: string | undefined
): Promise<{ coupleId: string; phone: string } | null> {
  if (!token) return null;

  const { data, error } = await supabase
    .from("auth_tokens")
    .select("couple_id, phone, expires_at")
    .eq("token", token)
    .maybeSingle<{ couple_id: string; phone: string; expires_at: string }>();

  if (error || !data) return null;
  if (new Date(data.expires_at) < new Date()) return null;

  return { coupleId: data.couple_id, phone: data.phone };
}

export function buildLoginUrl(coupleId: string, token: string): string {
  return `${env.PUBLIC_BASE_URL}/${encodeURIComponent(coupleId)}/login?t=${token}`;
}

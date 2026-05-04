/**
 * Spectrum worker.
 *
 * Long-running Node process that holds the persistent iMessage connection
 * Spectrum requires (`for await … of app.messages`). Vercel can't run this.
 *
 * Responsibilities:
 *  1. Listen on Spectrum's inbound stream.
 *  2. If a message looks like a pairing code (PAIR-XXXX), confirm the
 *     sender's side of a pending `pairings` row. When both sides are
 *     confirmed, create the iMessage group via `imessage(app).space(a, b)`,
 *     persist the couple row, and welcome them.
 *  3. Otherwise, forward the event to the Next.js webhook.
 *  4. Cache recent Message objects in an LRU so the app can react-by-id
 *     via the /react HTTP endpoint we expose here.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { createClient } from "@supabase/supabase-js";
import http from "node:http";
import { createHash } from "node:crypto";

const PROJECT_ID = process.env.PROJECT_ID;
const PROJECT_SECRET = process.env.PROJECT_SECRET;
const INTERNAL_WEBHOOK_URL = process.env.INTERNAL_WEBHOOK_URL ?? "http://localhost:3000/api/photon/webhook";
const INTERNAL_WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PORT = Number(process.env.PORT ?? 8787);

if (!PROJECT_ID || !PROJECT_SECRET) throw new Error("PROJECT_ID/PROJECT_SECRET required");
if (!INTERNAL_WEBHOOK_SECRET) throw new Error("INTERNAL_WEBHOOK_SECRET required");
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_KEY required");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const HELLO =
  "hi 👋 — i'm your shared memory. forward me anything you both want to remember and i'll keep it for you.";

const PAIR_RE = /\bPAIR-([0-9A-HJKMNP-TV-Z]{4})\b/i;

// ─── LRU of recent inbound Messages, keyed by id, so /react can resolve ──
// Spectrum's react() is a method on the Message instance, not a free function.
type CachedMessage = { msg: { react: (e: string) => Promise<void> }; at: number };
const messageCache = new Map<string, CachedMessage>();
const MAX_CACHE = 5000;
const CACHE_TTL_MS = 30 * 60 * 1000;

function rememberMessage(id: string, msg: CachedMessage["msg"]) {
  messageCache.set(id, { msg, at: Date.now() });
  if (messageCache.size > MAX_CACHE) {
    // Drop the oldest 10% in one sweep.
    const drop = Math.floor(MAX_CACHE * 0.1);
    let i = 0;
    for (const k of messageCache.keys()) {
      if (i++ >= drop) break;
      messageCache.delete(k);
    }
  }
}

setInterval(() => {
  const cutoff = Date.now() - CACHE_TTL_MS;
  for (const [k, v] of messageCache) if (v.at < cutoff) messageCache.delete(k);
}, 5 * 60 * 1000).unref();

// ─── Forward event to Next.js webhook ────────────────────────────────────
type Part =
  | { type: "text"; value: string }
  | { type: "link"; value: string }
  | { type: "media"; data_base64?: string; mime_type?: string; filename?: string; size_bytes?: number };

async function forward(payload: {
  event_type: "message.received";
  space_id: string;
  space_type: "dm" | "group";
  message_id: string;
  sender_handle: string;
  parts: Part[];
  sent_at?: string;
}): Promise<void> {
  const res = await fetch(INTERNAL_WEBHOOK_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${INTERNAL_WEBHOOK_SECRET}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[worker] webhook failed", res.status, text);
  }
}

// Detect URLs in text so we tag them as link parts (mirrors Linq's behavior).
const URL_RE = /\bhttps?:\/\/[^\s]+/i;

// ─── Pairing-code handling ────────────────────────────────────────────────
type PairingRow = {
  code: string;
  partner_a: string;
  partner_b: string;
  partner_a_confirmed_at: string | null;
  partner_b_confirmed_at: string | null;
  couple_id: string | null;
};

async function tryConsumePairingCode(senderId: string, text: string): Promise<boolean> {
  const m = text.match(PAIR_RE);
  if (!m) return false;
  const code = `PAIR-${m[1].toUpperCase()}`;

  const { data: pairing, error } = await supabase
    .from("pairings")
    .select("code, partner_a, partner_b, partner_a_confirmed_at, partner_b_confirmed_at, couple_id")
    .eq("code", code)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<PairingRow>();

  if (error || !pairing) {
    console.warn("[worker] unknown/expired pairing", code, senderId);
    return false;
  }

  const isA = pairing.partner_a === senderId;
  const isB = pairing.partner_b === senderId;
  if (!isA && !isB) {
    console.warn("[worker] pairing code from non-participant", code, senderId);
    return false;
  }

  // Stamp the right side as confirmed.
  const updates: Partial<PairingRow> = {};
  if (isA && !pairing.partner_a_confirmed_at) updates.partner_a_confirmed_at = new Date().toISOString();
  if (isB && !pairing.partner_b_confirmed_at) updates.partner_b_confirmed_at = new Date().toISOString();
  if (Object.keys(updates).length > 0) {
    await supabase.from("pairings").update(updates).eq("code", code);
  }

  // Both sides done → create the group and the couple row.
  const aDone = pairing.partner_a_confirmed_at || updates.partner_a_confirmed_at;
  const bDone = pairing.partner_b_confirmed_at || updates.partner_b_confirmed_at;
  if (aDone && bDone && !pairing.couple_id) {
    try {
      await createCoupleAndGroup(pairing.partner_a, pairing.partner_b, code);
    } catch (e) {
      console.error("[worker] failed to create group", e);
    }
  }
  return true;
}

async function createCoupleAndGroup(
  partnerA: string,
  partnerB: string,
  pairingCode: string
): Promise<void> {
  const im = imessage(app);
  // Resolve users + create the group space proactively.
  // (Once-confirmed numbers are no longer "cold" to us.)
  // Note: type narrowing is still loose at the runtime layer; we cast to any
  // for the send call.
  const alice = await (im as { user: (id: string) => Promise<unknown> }).user(partnerA);
  const bob = await (im as { user: (id: string) => Promise<unknown> }).user(partnerB);
  const space = await (im as { space: (...users: unknown[]) => Promise<{ id: string; send: (text: string) => Promise<void> }> }).space(alice, bob);

  // Stable couple id derived from the pairing code so the dashboard URL is
  // predictable while the pairing is still on screen.
  const coupleId = `c_${createHash("sha256").update(pairingCode).digest("hex").slice(0, 16)}`;

  const { error: insertErr } = await supabase
    .from("couples")
    .upsert({ id: coupleId, partner_a: partnerA, partner_b: partnerB, photon_space_id: space.id });
  if (insertErr) {
    console.error("[worker] couples upsert failed", insertErr);
    return;
  }
  await supabase.from("pairings").update({ couple_id: coupleId }).eq("code", pairingCode);

  await space.send(HELLO);
  console.log("[worker] couple created", coupleId, "space", space.id);
}

// ─── Tiny HTTP server for /send and /react callbacks ──────────────────────
function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    if (req.headers.authorization !== `Bearer ${INTERNAL_WEBHOOK_SECRET}`) {
      res.statusCode = 401;
      res.end("unauthorized");
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    let body: { spaceId?: string; text?: string; messageId?: string; emoji?: string } = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.statusCode = 400;
      res.end("invalid json");
      return;
    }

    try {
      if (req.url === "/send") {
        if (!body.spaceId || !body.text) {
          res.statusCode = 400;
          res.end("spaceId+text required");
          return;
        }
        const im = imessage(app);
        // Reconstruct a Space handle from id. Spectrum's iMessage provider
        // accepts a bare id for sends.
        const space = await (im as {
          space: (input: { id: string; type: "group" | "dm" }) => Promise<{ send: (t: string) => Promise<void> }>;
        }).space({ id: body.spaceId, type: "group" });
        await space.send(body.text);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.url === "/react") {
        if (!body.messageId || !body.emoji) {
          res.statusCode = 400;
          res.end("messageId+emoji required");
          return;
        }
        const cached = messageCache.get(body.messageId);
        if (!cached) {
          res.statusCode = 404;
          res.end("message not in cache");
          return;
        }
        await cached.msg.react(body.emoji);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.statusCode = 404;
      res.end();
    } catch (e) {
      console.error("[worker] http handler failed", e);
      res.statusCode = 500;
      res.end("internal error");
    }
  });
  server.listen(PORT, () => console.log("[worker] http listening on", PORT));
}

// ─── Boot ────────────────────────────────────────────────────────────────
let app: Awaited<ReturnType<typeof Spectrum>>;

async function main() {
  app = await Spectrum({
    projectId: PROJECT_ID!,
    projectSecret: PROJECT_SECRET!,
    providers: [imessage.config()],
  });

  startHttpServer();
  console.log("[worker] spectrum connected; listening for messages");

  for await (const [space, message] of app.messages) {
    try {
      const senderId = (message as { sender: { id: string } }).sender.id;
      const messageId = (message as { id: string }).id;
      const spaceId = (space as unknown as { id: string }).id;
      const spaceType = ((space as unknown as { type?: "dm" | "group" }).type) ?? "dm";
      const content = (message as { content: { type: string; text?: string; data?: Buffer; mimeType?: string; name?: string } }).content;

      rememberMessage(messageId, message as unknown as CachedMessage["msg"]);

      // Pairing code? Handle here; do not forward.
      if (content.type === "text" && content.text && (await tryConsumePairingCode(senderId, content.text))) {
        continue;
      }

      // Translate content → parts[] for the existing ingest pipeline.
      const parts: Part[] = [];
      if (content.type === "text" && content.text) {
        parts.push({ type: "text", value: content.text });
        const m = content.text.match(URL_RE);
        if (m) parts.push({ type: "link", value: m[0] });
      } else if (content.type === "attachment" && content.data) {
        parts.push({
          type: "media",
          data_base64: content.data.toString("base64"),
          mime_type: content.mimeType,
          filename: content.name,
          size_bytes: content.data.byteLength,
        });
      }
      if (parts.length === 0) continue;

      await forward({
        event_type: "message.received",
        space_id: spaceId,
        space_type: spaceType,
        message_id: messageId,
        sender_handle: senderId,
        parts,
      });
    } catch (e) {
      console.error("[worker] message loop error", e);
    }
  }
}

main().catch((e) => {
  console.error("[worker] fatal", e);
  process.exit(1);
});

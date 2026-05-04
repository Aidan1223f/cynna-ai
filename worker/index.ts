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

const PAIR_RE = /\bPAIR-([0-9A-HJKMNP-TV-Z]{4})\b/i;
const URL_RE = /\bhttps?:\/\/[^\s]+/i;

// ─── LRU of recent inbound Messages for /react ───────────────────────────
type CachedMessage = { msg: { react: (e: string) => Promise<void> }; at: number };
const messageCache = new Map<string, CachedMessage>();
const MAX_CACHE = 5000;
const CACHE_TTL_MS = 30 * 60 * 1000;

function rememberMessage(id: string, msg: CachedMessage["msg"]) {
  messageCache.set(id, { msg, at: Date.now() });
  if (messageCache.size > MAX_CACHE) {
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

// ─── Send helpers (DM) ───────────────────────────────────────────────────
async function sendDM(spaceId: string, text: string) {
  const im = imessage(app);
  const space = await (im as {
    space: (input: { id: string; type: "dm" | "group" }) => Promise<{ send: (t: string) => Promise<void> }>;
  }).space({ id: spaceId, type: "dm" });
  await space.send(text);
}

async function sendDMs(spaceId: string, messages: string[], delayMs = 600) {
  for (let i = 0; i < messages.length; i++) {
    if (i > 0) await sleep(delayMs);
    await sendDM(spaceId, messages[i]);
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

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

// ─── Conversational pairing state machine ─────────────────────────────────
type PairingRow = {
  code: string;
  partner_a: string;
  partner_b: string | null;
  status: string;
  initiator_dm_space_id: string | null;
  partner_dm_space_id: string | null;
  data: { initiator_name?: string; initiator_vibe?: string; partner_name?: string; partner_vibe?: string };
  couple_id: string | null;
  expires_at: string;
};

/**
 * Try to handle an inbound DM as part of the pairing flow.
 * Returns true if the message was consumed (caller should not forward).
 */
async function handlePairingMessage(
  senderId: string,
  spaceId: string,
  text: string
): Promise<boolean> {
  // 1. Check if this is a fresh PAIR-XXXX code
  const codeMatch = text.match(PAIR_RE);
  if (codeMatch) {
    return await handleCodeSubmission(senderId, spaceId, `PAIR-${codeMatch[1].toUpperCase()}`);
  }

  // 2. Check if sender is in an active pairing conversation (by DM space)
  const { data: byInitiator } = await supabase
    .from("pairings")
    .select("*")
    .eq("initiator_dm_space_id", spaceId)
    .not("status", "in", '("complete","expired","awaiting_partner","awaiting_initiator")')
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<PairingRow>();

  if (byInitiator) return await advanceInitiator(byInitiator, text);

  const { data: byPartner } = await supabase
    .from("pairings")
    .select("*")
    .eq("partner_dm_space_id", spaceId)
    .not("status", "in", '("complete","expired","awaiting_initiator","awaiting_partner")')
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<PairingRow>();

  if (byPartner) return await advancePartner(byPartner, text);

  return false;
}

async function handleCodeSubmission(
  senderId: string,
  spaceId: string,
  code: string
): Promise<boolean> {
  const { data: pairing, error } = await supabase
    .from("pairings")
    .select("*")
    .eq("code", code)
    .maybeSingle<PairingRow>();

  if (error || !pairing) return false;

  // Expired?
  if (new Date(pairing.expires_at) < new Date()) {
    await sendDM(spaceId, "this code expired — grab a fresh one at cynna.app");
    await supabase.from("pairings").update({ status: "expired" }).eq("code", code);
    return true;
  }

  // Initiator submits their code
  if (pairing.status === "awaiting_initiator" && pairing.partner_a === senderId) {
    await supabase.from("pairings").update({
      status: "asking_initiator_name",
      initiator_dm_space_id: spaceId,
    }).eq("code", code);

    await sendDMs(spaceId, [
      "hey — got your code. i'm cynna, your shared memory bot.",
      "what should i call you?",
    ]);
    return true;
  }

  // Initiator re-texts while waiting for partner
  if (pairing.status === "awaiting_partner" && pairing.partner_a === senderId) {
    await sendDM(spaceId, "still waiting on your partner — once they text me this code, we're all set.");
    return true;
  }

  // Partner submits the code
  if (pairing.status === "awaiting_partner" && senderId !== pairing.partner_a) {
    await supabase.from("pairings").update({
      status: "asking_partner_name",
      partner_b: senderId,
      partner_dm_space_id: spaceId,
    }).eq("code", code);

    const initiatorName = pairing.data.initiator_name ?? "your partner";
    await sendDMs(spaceId, [
      `hey — ${initiatorName} added me to remember things with you two.`,
      "what's your name?",
    ]);
    return true;
  }

  return false;
}

async function advanceInitiator(pairing: PairingRow, text: string): Promise<boolean> {
  const spaceId = pairing.initiator_dm_space_id!;

  if (pairing.status === "asking_initiator_name") {
    const name = text.trim().slice(0, 40);
    if (!name) {
      await sendDM(spaceId, "i just need your name for now — what should i call you?");
      return true;
    }
    const data = { ...pairing.data, initiator_name: name };
    await supabase.from("pairings").update({ status: "asking_initiator_vibe", data }).eq("code", pairing.code);
    await sendDMs(spaceId, [
      `nice to meet you, ${name.toLowerCase()}.`,
      "quick question before we get your partner set up — when you two remember something together, what is it usually? food spots, trip ideas, random articles, something else?",
    ]);
    return true;
  }

  if (pairing.status === "asking_initiator_vibe") {
    const vibe = text.trim().slice(0, 120);
    const data = { ...pairing.data, initiator_vibe: vibe || "all sorts of things" };
    const minutesLeft = Math.max(1, Math.round((new Date(pairing.expires_at).getTime() - Date.now()) / 60000));
    await supabase.from("pairings").update({ status: "awaiting_partner", data }).eq("code", pairing.code);
    await sendDMs(spaceId, [
      `perfect. now here's what you do: get your partner to text me this same code — ${pairing.code} — and i'll set up your shared thread.`,
      `the code is good for another ${minutesLeft} minutes. once they text me, i'll take it from there.`,
    ]);
    return true;
  }

  return false;
}

async function advancePartner(pairing: PairingRow, text: string): Promise<boolean> {
  const spaceId = pairing.partner_dm_space_id!;

  if (pairing.status === "asking_partner_name") {
    const name = text.trim().slice(0, 40);
    if (!name) {
      await sendDM(spaceId, "i just need your name for now — what should i call you?");
      return true;
    }
    const data = { ...pairing.data, partner_name: name };
    await supabase.from("pairings").update({ status: "asking_partner_vibe", data }).eq("code", pairing.code);
    await sendDMs(spaceId, [
      `hey ${name.toLowerCase()} — one thing before we start:`,
      "is there anything you definitely want to never lose track of? a show, a restaurant, a place you keep meaning to visit?",
    ]);
    return true;
  }

  if (pairing.status === "asking_partner_vibe") {
    const vibe = text.trim().slice(0, 120);
    const data = { ...pairing.data, partner_vibe: vibe || "everything" };
    await supabase.from("pairings").update({ status: "complete", data }).eq("code", pairing.code);
    await createCoupleAndGroup(pairing, { ...data, partner_vibe: vibe || "everything" });
    await sendDM(spaceId, "done — check your iMessage for the new group thread 🎉");
    return true;
  }

  return false;
}

async function createCoupleAndGroup(
  pairing: PairingRow,
  data: { initiator_name?: string; initiator_vibe?: string; partner_name?: string; partner_vibe?: string }
): Promise<void> {
  const im = imessage(app);
  const alice = await (im as { user: (id: string) => Promise<unknown> }).user(pairing.partner_a);
  const bob = await (im as { user: (id: string) => Promise<unknown> }).user(pairing.partner_b!);
  const space = await (im as { space: (...users: unknown[]) => Promise<{ id: string; send: (t: string) => Promise<void> }> }).space(alice, bob);

  const coupleId = `c_${createHash("sha256").update(pairing.code).digest("hex").slice(0, 16)}`;

  const { error: insertErr } = await supabase
    .from("couples")
    .upsert({ id: coupleId, partner_a: pairing.partner_a, partner_b: pairing.partner_b, photon_space_id: space.id });
  if (insertErr) {
    console.error("[worker] couples upsert failed", insertErr);
    return;
  }
  await supabase.from("pairings").update({ couple_id: coupleId }).eq("code", pairing.code);

  const iName = (data.initiator_name ?? "").toLowerCase() || "one of you";
  const pName = (data.partner_name ?? "").toLowerCase() || "the other";
  const iVibe = (data.initiator_vibe ?? "").slice(0, 40) || "all sorts of things";
  const pVibe = (data.partner_vibe ?? "").slice(0, 40) || "everything";

  await space.send("okay — you two are connected. this is your shared memory thread.\n\nforward me anything you want to remember together: links, photos, voice notes, or just text. i'll keep it all.");
  await sleep(1500);

  if (iVibe === pVibe) {
    await space.send(`you both said ${iVibe} — already on the same page. ask me anything, anytime.`);
  } else {
    await space.send(`${iName} told me you're mostly saving ${iVibe}, ${pName} mentioned ${pVibe} — i'll keep an eye out for both.\n\nask me anything, anytime.`);
  }

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

      // DMs: try pairing flow first. If consumed, don't forward.
      if (spaceType === "dm" && content.type === "text" && content.text) {
        if (await handlePairingMessage(senderId, spaceId, content.text)) {
          continue;
        }
      }

      // Code in a group (edge case — someone texted the code in an existing group)
      if (content.type === "text" && content.text?.match(PAIR_RE)) {
        if (await handlePairingMessage(senderId, spaceId, content.text)) {
          continue;
        }
      }

      // Normal message — forward to Next.js ingest pipeline.
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

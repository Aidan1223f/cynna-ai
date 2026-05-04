/**
 * Photon smoke test — confirms the worker is reachable and can spin up a chat.
 *
 * Usage:
 *   pnpm tsx scripts/photon-smoke.ts +1234567890
 *   pnpm tsx scripts/photon-smoke.ts +1234567890 +1234567891   # group chat
 *
 * Requires WORKER_URL, INTERNAL_WEBHOOK_SECRET in .env.local.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const to = process.argv.slice(2);
  if (to.length === 0) {
    console.error("usage: pnpm tsx scripts/photon-smoke.ts <+e164> [+e164 ...]");
    process.exit(1);
  }

  const workerUrl = process.env.WORKER_URL;
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!workerUrl || !secret) {
    console.error("Missing WORKER_URL or INTERNAL_WEBHOOK_SECRET in .env.local");
    process.exit(1);
  }

  const message = to.length > 1
    ? "hi 👋 — this is a love-send sandbox test. you can ignore this thread."
    : "hi 👋 — love-send smoke test. you can ignore this message.";

  const res = await fetch(`${workerUrl}/chats`, {
    method: "POST",
    headers: { "x-internal-secret": secret, "content-type": "application/json" },
    body: JSON.stringify({ to, message }),
  });

  const text = await res.text();
  console.log("status:", res.status);
  console.log("body:  ", text);
  if (!res.ok) process.exit(1);

  try {
    const j = JSON.parse(text);
    const chatId = j?.chat?.id ?? j?.id;
    if (chatId) console.log("\n✅ chat created — chat.id =", chatId);
  } catch { /* ignore */ }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

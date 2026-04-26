/**
 * Linq smoke test — confirms credentials and that one bot handle can spin up a chat.
 *
 * Usage:
 *   pnpm tsx scripts/linq-smoke.ts +1234567890
 *   pnpm tsx scripts/linq-smoke.ts +1234567890 +1234567891   # group chat
 *
 * Requires LINQ_TOKEN, LINQ_BOT_HANDLE in .env.local.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = "https://api.linqapp.com/api/partner/v3";

async function main() {
  const to = process.argv.slice(2);
  if (to.length === 0) {
    console.error("usage: pnpm tsx scripts/linq-smoke.ts <+e164> [+e164 ...]");
    process.exit(1);
  }

  const token = process.env.LINQ_TOKEN;
  const bot = process.env.LINQ_BOT_HANDLE;
  if (!token || !bot) {
    console.error("Missing LINQ_TOKEN or LINQ_BOT_HANDLE in .env.local");
    process.exit(1);
  }

  const message = to.length > 1
    ? "hi 👋 — this is a love-send sandbox test. you can ignore this thread."
    : "hi 👋 — love-send smoke test. you can ignore this message.";

  const res = await fetch(`${BASE}/chats`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ from: bot, to, message }),
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

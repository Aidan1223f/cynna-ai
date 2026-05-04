/**
 * Photon smoke test — confirms the Next.js → worker outbound path.
 *
 * Usage:
 *   pnpm tsx scripts/photon-smoke.ts <space-id> "hello from smoke"
 *
 * Requires WORKER_URL and INTERNAL_WEBHOOK_SECRET in .env.local. The worker
 * must be running (locally on :8787 or via WORKER_URL pointing at Fly).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const [spaceId, ...rest] = process.argv.slice(2);
  const text = rest.join(" ");
  if (!spaceId || !text) {
    console.error("usage: pnpm tsx scripts/photon-smoke.ts <space-id> <text>");
    process.exit(1);
  }

  const url = process.env.WORKER_URL ?? "http://localhost:8787";
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Missing INTERNAL_WEBHOOK_SECRET in .env.local");
    process.exit(1);
  }

  const res = await fetch(`${url}/send`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ spaceId, text }),
  });
  const body = await res.text();
  console.log("status:", res.status);
  console.log("body:  ", body);
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

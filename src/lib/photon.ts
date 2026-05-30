import "server-only";
import { env } from "./env";

/**
 * Photon outbound proxy.
 *
 * Spectrum's send/react APIs only exist on the live `Spectrum()` instance,
 * which is a long-lived async iterator — it can't run inside Next.js routes
 * on Vercel. So the worker (worker/index.ts) holds the connection and
 * exposes a tiny HTTP surface that this module wraps.
 *
 * Auth: shared INTERNAL_WEBHOOK_SECRET as a bearer header.
 */

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.WORKER_URL}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.INTERNAL_WEBHOOK_SECRET}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`worker ${path} → ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

/** Send a plain-text message into an existing iMessage Space (DM or group). */
export async function sendText(spaceId: string, text: string): Promise<void> {
  await call("/send", { spaceId, text });
}

/** React to a recent inbound message by id. The worker holds an LRU of
 *  recent Message objects so it can resolve the id back to the Message
 *  instance (Spectrum's react() is a method on Message, not a free fn). */
export async function reactToMessage(messageId: string, emoji: string): Promise<void> {
  await call("/react", { messageId, emoji });
}

import "server-only";
import { env } from "./env";

type Part =
  | { type: "text"; value: string }
  | { type: "link"; value: string }
  | { type: "media"; id?: string; url?: string; filename?: string; mime_type?: string; size_bytes?: number };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${env.WORKER_URL}${path}`, {
    method,
    headers: {
      "x-internal-secret": env.INTERNAL_WEBHOOK_SECRET,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Photon worker ${method} ${path} → ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export type CreateChatResponse = {
  chat?: { id: string; is_group?: boolean };
  id?: string;
  [k: string]: unknown;
};

/** Create a new (group) chat via the Photon worker. `to.length >= 2` makes it a group. */
export async function createChat(input: { to: string[]; message: string }): Promise<CreateChatResponse> {
  return call<CreateChatResponse>("POST", "/chats", {
    to: input.to,
    message: input.message,
  });
}

/** Send a message into an existing chat. */
export async function sendMessage(chatId: string, parts: Part[]): Promise<unknown> {
  return call("POST", `/chats/${encodeURIComponent(chatId)}/messages`, {
    message: { parts },
  });
}

/** Add an emoji reaction to a specific message. Used for the silent ✅ confirmation. */
export async function react(messageId: string, emoji: string): Promise<unknown> {
  return call("POST", `/messages/${encodeURIComponent(messageId)}/reactions`, {
    emoji,
  });
}

/** Download a media attachment by id (worker proxies to Photon's attachments.download). */
export async function downloadMedia(idOrUrl: string): Promise<{ buf: ArrayBuffer; mime: string }> {
  const res = await fetch(`${env.WORKER_URL}/media/${encodeURIComponent(idOrUrl)}`, {
    headers: { "x-internal-secret": env.INTERNAL_WEBHOOK_SECRET },
  });
  if (!res.ok) throw new Error(`downloadMedia ${idOrUrl} → ${res.status}`);
  const mime = res.headers.get("content-type") ?? "application/octet-stream";
  return { buf: await res.arrayBuffer(), mime };
}

import "server-only";
import { env } from "./env";

const BASE = "https://api.linqapp.com/api/partner/v3";

type Part =
  | { type: "text"; value: string }
  | { type: "link"; value: string }
  | { type: "media"; id?: string; url?: string; filename?: string; mime_type?: string; size_bytes?: number };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.LINQ_TOKEN}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Linq ${method} ${path} → ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export type CreateChatResponse = {
  // Linq returns at least chat.id; rest of shape unknown until first real call.
  chat?: { id: string; is_group?: boolean; owner_handle?: string };
  id?: string;
  [k: string]: unknown;
};

/** Create a new (group) chat. `to.length >= 2` makes it a group. */
export async function createChat(input: { to: string[]; message: string }): Promise<CreateChatResponse> {
  return call<CreateChatResponse>("POST", "/chats", {
    from: env.LINQ_BOT_HANDLE,
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

/** Download a media URL (images, voice notes) returned in webhook payloads. */
export async function downloadMedia(url: string): Promise<{ buf: ArrayBuffer; mime: string }> {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${env.LINQ_TOKEN}` },
  });
  if (!res.ok) throw new Error(`downloadMedia ${url} → ${res.status}`);
  const mime = res.headers.get("content-type") ?? "application/octet-stream";
  return { buf: await res.arrayBuffer(), mime };
}

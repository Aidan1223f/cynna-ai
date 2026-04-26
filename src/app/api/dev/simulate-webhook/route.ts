import { ingest } from "@/lib/ingest";
import { MessageEvent, type Part } from "@/lib/types";
import { z } from "zod";

const SimRequest = z.object({
  kind: z.enum(["text", "link", "image", "voice"]),
  chatId: z.string(),
  sender: z.string(),
  value: z.string().optional(),
  /** Optional override for the synthetic message id (otherwise time-based). */
  messageId: z.string().optional(),
});

function buildParts(
  kind: "text" | "link" | "image" | "voice",
  value: string | undefined
): Part[] {
  switch (kind) {
    case "text":
      return [{ type: "text", value: value ?? "hello from the simulator" }];
    case "link":
      return [{ type: "link", value: value ?? "https://www.instagram.com/reel/example/" }];
    case "image":
      return [{
        type: "media",
        url: value ?? "https://placehold.co/600x400.png",
        mime_type: "image/png",
        filename: "sim.png",
      }];
    case "voice":
      return [{
        type: "media",
        url: value ?? "https://example.com/sim-voice.m4a",
        mime_type: "audio/x-m4a",
        filename: "sim.m4a",
      }];
  }
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new Response("not available in production", { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const parsed = SimRequest.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { kind, chatId, sender, value, messageId } = parsed.data;
  const envelope = MessageEvent.parse({
    event_type: "message.received",
    event_id: `sim_${Date.now()}`,
    created_at: new Date().toISOString(),
    data: {
      chat: { id: chatId, is_group: true },
      id: messageId ?? `sim_msg_${Date.now()}`,
      direction: "inbound",
      sender_handle: sender,
      parts: buildParts(kind, value),
    },
  });

  await ingest(envelope);
  return Response.json({ ok: true, kind });
}

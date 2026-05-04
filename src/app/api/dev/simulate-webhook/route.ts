import { ingest } from "@/lib/ingest";
import { PhotonEvent, type Part } from "@/lib/types";
import { z } from "zod";

const SimRequest = z.object({
  kind: z.enum(["text", "link", "image", "voice"]),
  spaceId: z.string(),
  sender: z.string(),
  value: z.string().optional(),
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
        // 1x1 transparent png; the dashboard renders inline:<id> placeholders
        // for now since we don't persist media bytes.
        data_base64:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        mime_type: "image/png",
        filename: "sim.png",
      }];
    case "voice":
      return [{
        type: "media",
        data_base64: value ?? "",
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

  const { kind, spaceId, sender, value, messageId } = parsed.data;
  const envelope = PhotonEvent.parse({
    event_type: "message.received",
    space_id: spaceId,
    space_type: "group",
    message_id: messageId ?? `sim_msg_${Date.now()}`,
    sender_handle: sender,
    parts: buildParts(kind, value),
  });

  await ingest(envelope);
  return Response.json({ ok: true, kind });
}

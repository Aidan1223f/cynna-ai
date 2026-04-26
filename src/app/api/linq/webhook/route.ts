import { env } from "@/lib/env";
import { ingest } from "@/lib/ingest";
import { MessageEvent } from "@/lib/types";

export async function POST(request: Request): Promise<Response> {
  // Interim auth: shared-secret header until Linq's HMAC scheme is documented.
  const secret = request.headers.get("x-linq-secret");
  if (secret !== env.LINQ_WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const parsed = MessageEvent.safeParse(json);
  if (!parsed.success) {
    console.warn("[webhook] zod parse failed", parsed.error.flatten());
    return new Response("invalid envelope", { status: 400 });
  }

  // Only react to inbound messages; ignore reactions, status updates, etc.
  if (parsed.data.event_type !== "message.received") {
    return Response.json({ ok: true, ignored: parsed.data.event_type });
  }

  await ingest(parsed.data);
  return Response.json({ ok: true });
}

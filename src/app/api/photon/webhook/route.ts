import { env } from "@/lib/env";
import { ingest } from "@/lib/ingest";
import { PhotonEvent } from "@/lib/types";

/**
 * Inbound from the Spectrum worker (worker/index.ts).
 * The worker has already filtered out pairing-code messages (those mutate
 * pairings + create couples directly in the worker) so anything that arrives
 * here is meant for the ingest pipeline.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.INTERNAL_WEBHOOK_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const parsed = PhotonEvent.safeParse(json);
  if (!parsed.success) {
    console.warn("[photon webhook] zod parse failed", parsed.error.flatten());
    return new Response("invalid envelope", { status: 400 });
  }

  await ingest(parsed.data);
  return Response.json({ ok: true });
}

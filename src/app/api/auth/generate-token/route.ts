import { env } from "@/lib/env";
import { generateToken, buildLoginUrl } from "@/lib/auth";
import { z } from "zod";

const Body = z.object({
  coupleId: z.string(),
  phone: z.string(),
});

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("authorization") !== `Bearer ${env.INTERNAL_WEBHOOK_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { coupleId, phone } = parsed.data;
  const token = await generateToken(coupleId, phone);
  const url = buildLoginUrl(coupleId, token);

  return Response.json({ token, url });
}

import { z } from "zod";
import { classifyUrl } from "@/lib/sources";
import { unfurl } from "@/lib/unfurl";
import { extractAppleMaps } from "@/lib/extractors/apple-maps";
import { classifySubject } from "@/lib/classify-subject";

const Body = z.object({
  url: z.string().url(),
  /** Optional list of existing subject names to simulate the couple's history. */
  existingSubjects: z.array(z.string()).optional(),
  /** Skip the AI subject call to save tokens / latency while iterating. */
  skipAi: z.boolean().optional(),
});

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
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { url, existingSubjects = [], skipAi = false } = parsed.data;

  const t0 = Date.now();
  const classified = classifyUrl(url);

  let unfurled: Awaited<ReturnType<typeof unfurl>> | null = null;
  let place: ReturnType<typeof extractAppleMaps> | null = null;

  if (classified?.provider === "apple_maps") {
    place = extractAppleMaps(url);
  } else {
    unfurled = await unfurl(url);
  }

  const t1 = Date.now();

  const subjectText =
    place?.name ||
    place?.address ||
    unfurled?.title ||
    unfurled?.description ||
    "";

  let subject: Awaited<ReturnType<typeof classifySubject>> = null;
  if (!skipAi && subjectText) {
    subject = await classifySubject({
      text: subjectText,
      provider: classified?.provider ?? null,
      existing: existingSubjects,
    });
  }

  const t2 = Date.now();

  return Response.json({
    input: url,
    classified,
    unfurled,
    place,
    subject,
    timings_ms: {
      extract: t1 - t0,
      classify: t2 - t1,
      total: t2 - t0,
    },
  });
}

import "server-only";
import OpenAI from "openai";
import { env, hasOpenAI } from "./env";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _client;
}

export type SubjectInput = {
  /** Anything we know about this save: caption, transcript, place name, etc. */
  text: string;
  /** Source platform — helps the model interpret context. */
  provider: string | null;
  /** Existing subject names for this couple (for reuse). */
  existing: string[];
};

export type SubjectGuess = {
  /** Short, human-readable subject name. Reuses existing if appropriate. */
  name: string;
  /** True if `name` already exists in `existing`; false if new. */
  reused: boolean;
  /** One-word coarse bucket: places, food, watch, gift, date, music, other. */
  bucket: string;
};

const SYSTEM = `You are organizing a couple's shared memory. Each "save" is a link, video, or place one partner sent the other.

Your job: pick or create a SHORT subject name (2-5 words, Title Case, no quotes) for the save, plus a one-word coarse bucket.

Rules:
- Prefer reusing an existing subject when the new save is clearly about the same thing.
- Subject names should be specific enough to be useful ("Lisbon Restaurants" not "Food") but general enough to group siblings.
- Bucket must be one of: places, food, watch, gift, date, music, other.

Output strict JSON: {"name": "...", "reused": true|false, "bucket": "..."}`;

export async function classifySubject(input: SubjectInput): Promise<SubjectGuess | null> {
  if (!hasOpenAI) return null;
  const text = input.text.trim().slice(0, 4000);
  if (!text) return null;

  const userMsg = [
    `Provider: ${input.provider ?? "unknown"}`,
    `Existing subjects for this couple: ${
      input.existing.length ? JSON.stringify(input.existing) : "(none yet)"
    }`,
    `Save content:`,
    text,
  ].join("\n");

  const res = await client().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 120,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userMsg },
    ],
  });

  const raw = res.choices[0]?.message?.content;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      name?: string;
      reused?: boolean;
      bucket?: string;
    };
    if (!parsed.name) return null;
    const name = parsed.name.trim().slice(0, 60);
    const reused = input.existing.some(
      (e) => e.toLowerCase() === name.toLowerCase()
    );
    return {
      name,
      reused: parsed.reused ?? reused,
      bucket: (parsed.bucket || "other").toLowerCase().slice(0, 20),
    };
  } catch {
    return null;
  }
}

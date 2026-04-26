import "server-only";
import OpenAI from "openai";
import { env, hasOpenAI } from "./env";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _client;
}

export async function embed(text: string): Promise<number[] | null> {
  if (!hasOpenAI) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const res = await client().embeddings.create({
    model: "text-embedding-3-small",
    input: trimmed.slice(0, 8000),
  });
  return res.data[0]?.embedding ?? null;
}

/** Whisper transcription. Pass an ArrayBuffer + mime type. Returns null when no key. */
export async function transcribe(buf: ArrayBuffer, mime: string, filename = "audio"): Promise<string | null> {
  if (!hasOpenAI) return null;
  const file = new File([buf], `${filename}`, { type: mime });
  const res = await client().audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return res.text ?? null;
}

import { z } from "zod";

const TextPart = z.object({
  type: z.literal("text"),
  value: z.string(),
});

const LinkPart = z.object({
  type: z.literal("link"),
  value: z.string().url(),
});

const MediaPart = z.object({
  type: z.literal("media"),
  id: z.string().optional(),
  url: z.string().url().optional(),
  filename: z.string().optional(),
  mime_type: z.string().optional(),
  size_bytes: z.number().optional(),
});

export const Part = z.discriminatedUnion("type", [TextPart, LinkPart, MediaPart]);
export type Part = z.infer<typeof Part>;

export const MessageEvent = z.object({
  api_version: z.string().optional(),
  webhook_version: z.string().optional(),
  event_type: z.string(),
  event_id: z.string().optional(),
  created_at: z.string().optional(),
  trace_id: z.string().optional(),
  partner_id: z.string().optional(),
  data: z.object({
    chat: z.object({
      id: z.string(),
      is_group: z.boolean().optional(),
      owner_handle: z.string().optional(),
    }),
    id: z.string(),                          // message id
    idempotency_key: z.string().optional(),
    direction: z.string().optional(),
    sender_handle: z.string(),
    parts: z.array(Part),
    sent_at: z.string().optional(),
    delivered_at: z.string().nullable().optional(),
    read_at: z.string().nullable().optional(),
    reply_to: z.string().nullable().optional(),
    effect: z.string().nullable().optional(),
    service: z.string().optional(),
    preferred_service: z.string().optional(),
  }),
});
export type MessageEvent = z.infer<typeof MessageEvent>;

export type SaveKind = "text" | "link" | "image" | "voice";

/** Pick a single canonical kind from a `parts[]` array. */
export function deriveKind(parts: Part[]): SaveKind {
  for (const p of parts) {
    if (p.type === "link") return "link";
    if (p.type === "media") {
      const mime = p.mime_type ?? "";
      if (mime.startsWith("audio/")) return "voice";
      if (mime.startsWith("image/")) return "image";
      // fall through; if we don't recognize the media type, treat it as image
      return "image";
    }
  }
  return "text";
}

import { z } from "zod";

/**
 * Webhook envelope worker → Next.js.
 *
 * The worker translates Spectrum's `Message` objects into this shape so that
 * the existing ingest pipeline doesn't need to know about Spectrum directly.
 * Media buffers are inlined as base64 (no second download round-trip — the
 * worker already has the bytes from the gRPC stream).
 */

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
  // Inline bytes (base64). The worker has the buffer in hand from Spectrum.
  data_base64: z.string().optional(),
  mime_type: z.string().optional(),
  filename: z.string().optional(),
  size_bytes: z.number().optional(),
});

export const Part = z.discriminatedUnion("type", [TextPart, LinkPart, MediaPart]);
export type Part = z.infer<typeof Part>;

export const PhotonEvent = z.object({
  // "message.received" today; future: "reaction.received" etc.
  event_type: z.string(),
  // iMessage Space (chat) id from Spectrum — used as our couple_id.
  space_id: z.string(),
  space_type: z.enum(["dm", "group"]),
  // iMessage message id; unique per message; used for dedupe + react-by-id.
  message_id: z.string(),
  sender_handle: z.string(),
  parts: z.array(Part),
  sent_at: z.string().optional(),
});
export type PhotonEvent = z.infer<typeof PhotonEvent>;

export type SaveKind = "text" | "link" | "image" | "voice";

/** Pick a single canonical kind from a `parts[]` array. */
export function deriveKind(parts: Part[]): SaveKind {
  for (const p of parts) {
    if (p.type === "link") return "link";
    if (p.type === "media") {
      const mime = p.mime_type ?? "";
      if (mime.startsWith("audio/")) return "voice";
      if (mime.startsWith("image/")) return "image";
      return "image";
    }
  }
  return "text";
}

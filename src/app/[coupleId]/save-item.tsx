export type CoupleRow = {
  id: string;
  partner_a: string;
  partner_b: string;
  photon_space_id: string | null;
  created_at: string;
};

export type SaveRow = {
  id: string;
  couple_id: string;
  photon_message_id: string | null;
  sender_handle: string;
  kind: "text" | "link" | "image" | "voice";
  raw_text: string | null;
  source_url: string | null;
  media_url: string | null;
  transcript: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  created_at: string;
};

const ICON: Record<SaveRow["kind"], string> = {
  text: "💬",
  link: "🔗",
  image: "📷",
  voice: "🎙️",
};

function partnerLabel(senderHandle: string, couple: CoupleRow): string {
  if (senderHandle === couple.partner_a) return "A";
  if (senderHandle === couple.partner_b) return "B";
  return "?";
}

function bodyText(s: SaveRow): string {
  return (
    s.raw_text ||
    s.transcript ||
    s.og_title ||
    s.og_description ||
    s.source_url ||
    (s.kind === "voice" ? "transcribing…" : s.kind === "image" ? "image" : "")
  );
}

export function SaveItem({ save, couple }: { save: SaveRow; couple: CoupleRow }) {
  const label = partnerLabel(save.sender_handle, couple);
  const body = bodyText(save);
  const when = new Date(save.created_at).toLocaleString();

  return (
    <li className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span className="font-medium">{label}</span>
        <span>·</span>
        <span>{ICON[save.kind]}</span>
        <span>·</span>
        <span>{when}</span>
      </div>
      <div className="mt-2 text-sm">
        {save.source_url ? (
          <a
            href={save.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all"
          >
            {body}
          </a>
        ) : (
          <span className="break-words whitespace-pre-wrap">{body}</span>
        )}
      </div>
      {save.kind === "image" && save.media_url && !save.media_url.startsWith("inline:") && (
        // Plain <img>: media URLs are pre-signed and remote-pattern allowlist is deferred.
        // Day 1 Photon path stores `inline:<id>` placeholders since we don't
        // persist bytes — render nothing for those until object storage lands.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={save.media_url}
          alt=""
          className="mt-2 max-h-64 rounded border border-zinc-200 dark:border-zinc-800"
        />
      )}
    </li>
  );
}

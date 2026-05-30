export type SourceProvider =
  | "tiktok"
  | "instagram"
  | "youtube"
  | "apple_maps"
  | "google_maps"
  | "spotify"
  | "other";

export type SourceContent = "video" | "place" | "audio" | "page";

export type ClassifiedUrl = {
  provider: SourceProvider;
  content: SourceContent;
  normalizedUrl: string;
};

export function classifyUrl(rawUrl: string): ClassifiedUrl | null {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const normalizedUrl = u.toString();

  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    return { provider: "tiktok", content: "video", normalizedUrl };
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    const isReel = u.pathname.includes("/reel/") || u.pathname.includes("/reels/");
    return {
      provider: "instagram",
      content: isReel ? "video" : "page",
      normalizedUrl,
    };
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
    return { provider: "youtube", content: "video", normalizedUrl };
  }
  if (host === "maps.apple.com") {
    return { provider: "apple_maps", content: "place", normalizedUrl };
  }
  if (
    host === "maps.google.com" ||
    host === "google.com" && u.pathname.startsWith("/maps") ||
    host === "maps.app.goo.gl" ||
    host === "goo.gl"
  ) {
    return { provider: "google_maps", content: "place", normalizedUrl };
  }
  if (host === "open.spotify.com" || host === "spotify.link") {
    return { provider: "spotify", content: "audio", normalizedUrl };
  }

  return { provider: "other", content: "page", normalizedUrl };
}

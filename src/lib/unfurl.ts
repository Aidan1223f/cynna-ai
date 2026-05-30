import "server-only";
import { classifyUrl, type SourceProvider } from "./sources";

export type Unfurled = {
  title: string | null;
  description: string | null;
  image: string | null;
  author: string | null;
  provider: SourceProvider;
  resolved_url: string;
  raw: Record<string, unknown>;
};

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 300_000;

async function fetchText(
  url: string,
  init?: RequestInit
): Promise<{ text: string; finalUrl: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": BROWSER_UA,
        "accept-language": "en-US,en;q=0.9",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.5",
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) return null;
    const text = (await res.text()).slice(0, MAX_HTML_BYTES);
    return { text, finalUrl: res.url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pluckMeta(html: string, key: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeHtmlEntities(m[1].trim());
  }
  return null;
}

function pluckTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decodeHtmlEntities(m[1].trim()) : null;
}

function pluckJsonLd(html: string): Record<string, unknown> | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // ignore malformed
    }
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

/** Try platform-native oEmbed endpoints for the cleanest data. */
async function tryOembed(
  provider: SourceProvider,
  url: string
): Promise<Partial<Unfurled> | null> {
  let endpoint: string | null = null;
  if (provider === "tiktok") {
    endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  } else if (provider === "instagram") {
    // Instagram's public oEmbed requires an FB app token now; skip.
    return null;
  } else if (provider === "youtube") {
    endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  }
  if (!endpoint) return null;

  const r = await fetchText(endpoint, { headers: { accept: "application/json" } });
  if (!r) return null;
  try {
    const json = JSON.parse(r.text) as Record<string, unknown>;
    return {
      title: (json.title as string) || null,
      description: null,
      image: (json.thumbnail_url as string) || null,
      author: (json.author_name as string) || null,
      raw: json,
    };
  } catch {
    return null;
  }
}

async function unfurlHtml(url: string): Promise<Partial<Unfurled> | null> {
  const r = await fetchText(url);
  if (!r) return null;
  const { text: html, finalUrl } = r;

  const ld = pluckJsonLd(html);

  return {
    title:
      pluckMeta(html, "og:title") ||
      pluckMeta(html, "twitter:title") ||
      pluckTitle(html),
    description:
      pluckMeta(html, "og:description") || pluckMeta(html, "twitter:description"),
    image:
      pluckMeta(html, "og:image") ||
      pluckMeta(html, "twitter:image") ||
      pluckMeta(html, "twitter:image:src"),
    author:
      pluckMeta(html, "author") || pluckMeta(html, "article:author"),
    resolved_url: finalUrl,
    raw: ld ? { jsonld: ld } : {},
  };
}

export async function unfurl(rawUrl: string): Promise<Unfurled> {
  const c = classifyUrl(rawUrl);
  const provider = c?.provider ?? "other";
  const resolved_url = c?.normalizedUrl ?? rawUrl;

  const empty: Unfurled = {
    title: null,
    description: null,
    image: null,
    author: null,
    provider,
    resolved_url,
    raw: {},
  };

  // 1) Try oEmbed (TikTok, YouTube).
  const oembed = await tryOembed(provider, rawUrl);

  // 2) Always also fetch the page HTML — oEmbed often lacks description.
  const html = await unfurlHtml(rawUrl);

  if (!oembed && !html) return empty;

  return {
    ...empty,
    title: oembed?.title || html?.title || null,
    description: oembed?.description || html?.description || null,
    image: oembed?.image || html?.image || null,
    author: oembed?.author || html?.author || null,
    resolved_url: html?.resolved_url || resolved_url,
    raw: { oembed: oembed?.raw, html: html?.raw },
  };
}

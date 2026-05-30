import "server-only";

/**
 * Env loader. Required vars are checked lazily on first access so that
 * `next build` doesn't fail in environments where the secrets aren't present
 * (e.g. CI without prod creds). At runtime the first request that needs a
 * given var will throw if it's missing.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  // Photon Spectrum (https://app.photon.codes)
  get PROJECT_ID() { return required("PROJECT_ID"); },
  get PROJECT_SECRET() { return required("PROJECT_SECRET"); },
  // Shared secret on the worker → Next.js webhook (and the react callback the
  // other direction). Generate with `openssl rand -hex 32`.
  get INTERNAL_WEBHOOK_SECRET() { return required("INTERNAL_WEBHOOK_SECRET"); },
  // URL the worker POSTs inbound events to. Defaults to the local dev server.
  get INTERNAL_WEBHOOK_URL() {
    return optional("INTERNAL_WEBHOOK_URL") ?? "http://localhost:3000/api/photon/webhook";
  },
  // URL the Next.js app POSTs back to the worker for outbound actions
  // (sending text, reacting). Worker-side host:port; not used by the app.
  get WORKER_URL() {
    return optional("WORKER_URL") ?? "http://localhost:8787";
  },
  get OPENAI_API_KEY() { return optional("OPENAI_API_KEY"); },
  get SUPABASE_URL() { return required("SUPABASE_URL"); },
  get SUPABASE_SERVICE_KEY() { return required("SUPABASE_SERVICE_KEY"); },
  get PUBLIC_BASE_URL() { return optional("PUBLIC_BASE_URL") ?? "http://localhost:3000"; },
  // Display string the onboarding page shows ("text PAIR-XXXX to +1...").
  // Worker-side this is auto-discovered; app-side we just render whatever you set.
  get BOT_DISPLAY_NUMBER() { return optional("BOT_DISPLAY_NUMBER") ?? "the bot"; },
};

export const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

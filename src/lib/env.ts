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
  get PROJECT_ID() { return required("PROJECT_ID"); },
  get PROJECT_SECRET() { return required("PROJECT_SECRET"); },
  get INTERNAL_WEBHOOK_SECRET() { return required("INTERNAL_WEBHOOK_SECRET"); },
  get WORKER_URL() { return required("WORKER_URL"); },
  get OPENAI_API_KEY() { return optional("OPENAI_API_KEY"); },
  get SUPABASE_URL() { return required("SUPABASE_URL"); },
  get SUPABASE_SERVICE_KEY() { return required("SUPABASE_SERVICE_KEY"); },
  get PUBLIC_BASE_URL() { return optional("PUBLIC_BASE_URL") ?? "http://localhost:3000"; },
};

export const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

"use client";

import { useMemo, useRef, useState } from "react";

type ApiResult = { code: string; botNumber: string; expiresInSeconds: number };

const E164 = /^\+[1-9]\d{6,14}$/;

function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

function prettyPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}

export function InvitationPortal() {
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const phoneE164 = useMemo(() => normalizePhone(phone), [phone]);
  const phoneOk = E164.test(phoneE164);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneOk) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: phoneE164 }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg =
          typeof json?.error === "string"
            ? json.error
            : JSON.stringify(json?.error ?? "Something went wrong.");
        setError(msg);
      } else {
        setResult(json as ApiResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCode() {
    if (!result) return;
    await navigator.clipboard.writeText(result.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // ── Code screen ───────────────────────────────────────────────────────────
  if (result) {
    const smsUrl = `sms:${result.botNumber}&body=${encodeURIComponent(result.code)}`;

    return (
      <div className="w-full max-w-[420px]">
        <div className="surface-cream rounded-3xl p-6 sm:p-8">
          {/* Mock bot bubble */}
          <div className="mb-5 flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-[var(--color-cream-3)] px-3.5 py-2.5 text-[14.5px] text-[var(--color-ink)]">
              hey, just got your number &mdash; text me this code to get started
            </div>
          </div>

          {/* Code block */}
          <div className="rounded-xl border border-black/10 bg-white px-6 py-5 text-center">
            <div className="text-[12px] uppercase tracking-wider text-[var(--color-mute)]">
              your code
            </div>
            <div className="mt-2 font-mono text-[32px] tracking-[0.15em] text-[var(--color-ink)]">
              {result.code}
            </div>
            <button
              onClick={copyCode}
              aria-label="Copy pairing code"
              className="mt-2 text-[12px] text-[var(--color-mute)] underline decoration-black/20 underline-offset-4 hover:text-[var(--color-ink)]"
            >
              <span aria-live="polite">{copied ? "copied" : "copy"}</span>
            </button>
          </div>

          {/* Primary CTA — opens iMessage */}
          <a
            href={smsUrl}
            className="btn-depth-dark mt-5 flex w-full items-center justify-center text-[15px]"
          >
            Open iMessage
          </a>

          <p className="mt-4 text-center text-[12.5px] leading-relaxed text-[var(--color-mute)]">
            Or text{" "}
            <span className="font-medium text-[var(--color-ink)]">
              {result.botNumber || "the bot"}
            </span>{" "}
            manually. Code expires in {Math.round(result.expiresInSeconds / 60)} min.
          </p>
        </div>
      </div>
    );
  }

  // ── Phone entry ───────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-[420px]">
      <div className="mb-6 text-center">
        <span className="pill-badge mb-5 inline-flex">Set up cynna</span>
        <h1 className="font-display text-[36px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] sm:text-[44px]">
          Your number,{" "}
          <span className="italic text-[var(--color-mute)]">that&rsquo;s it.</span>
        </h1>
        <p className="mt-3 text-[15px] text-[var(--color-ink-soft)]">
          We&rsquo;ll take it from here &mdash; in iMessage.
        </p>
      </div>

      <div className="surface-cream rounded-3xl p-5 sm:p-7">
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-[15px] font-medium leading-snug text-[var(--color-ink)]">
              Your phone number
            </span>
            <input
              ref={inputRef}
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="(415) 555-1234"
              aria-label="Your phone number"
              aria-invalid={phone.length > 4 && !phoneOk ? "true" : "false"}
              className="field-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            {phoneOk && (
              <span className="mt-2 inline-block text-[12.5px] text-[var(--color-mute)]">
                &rarr; {prettyPhone(phoneE164)}
              </span>
            )}
          </label>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-[#b3261e]/30 bg-[#b3261e]/5 px-3 py-2 text-[13px] text-[#b3261e]"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-depth-dark h-11 w-full text-[15px]"
            disabled={submitting || !phoneOk}
          >
            {submitting ? "One sec…" : "Start"}
          </button>
        </form>
      </div>

      <p className="mt-5 px-2 text-center text-[12.5px] leading-relaxed text-[var(--color-mute)]">
        We&rsquo;ll text you a bot number to save. US numbers can skip the +1.
      </p>
    </div>
  );
}

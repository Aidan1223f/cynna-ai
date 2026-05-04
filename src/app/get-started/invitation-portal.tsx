"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type Step = "yourName" | "yourPhone" | "partnerName" | "partnerPhone" | "review";
type ApiResult = { coupleId: string; dashboardUrl: string };

const STEP_ORDER: Step[] = [
  "yourName",
  "yourPhone",
  "partnerName",
  "partnerPhone",
  "review",
];

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Light-touch normalizer: if the user types 10 digits (US) we'll add +1.
 * Otherwise we expect them to include the country code.
 */
function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

function prettyPhone(e164: string): string {
  // +14155551234 → +1 (415) 555-1234
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}

export function InvitationPortal() {
  const [step, setStep] = useState<Step>("yourName");
  const [yourName, setYourName] = useState("");
  const [yourPhone, setYourPhone] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [partnerPhone, setPartnerPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  const stepIndex = STEP_ORDER.indexOf(step);
  const progress = ((stepIndex + 1) / STEP_ORDER.length) * 100;

  const yourPhoneE164 = useMemo(() => normalizePhone(yourPhone), [yourPhone]);
  const partnerPhoneE164 = useMemo(
    () => normalizePhone(partnerPhone),
    [partnerPhone],
  );

  const yourPhoneOk = E164.test(yourPhoneE164);
  const partnerPhoneOk = E164.test(partnerPhoneE164);
  const samePhone =
    yourPhoneOk && partnerPhoneOk && yourPhoneE164 === partnerPhoneE164;

  function canAdvance(): boolean {
    switch (step) {
      case "yourName":
        return yourName.trim().length >= 1;
      case "yourPhone":
        return yourPhoneOk;
      case "partnerName":
        return partnerName.trim().length >= 1;
      case "partnerPhone":
        return partnerPhoneOk && !samePhone;
      case "review":
        return true;
    }
  }

  function next() {
    setError(null);
    if (!canAdvance()) return;
    const nextStep = STEP_ORDER[stepIndex + 1];
    if (nextStep) setStep(nextStep);
  }
  function back() {
    setError(null);
    const prev = STEP_ORDER[stepIndex - 1];
    if (prev) setStep(prev);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          partnerA: yourPhoneE164,
          partnerB: partnerPhoneE164,
        }),
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  function onFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step === "review") {
      submit();
    } else {
      next();
    }
  }

  // ── Success card ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="w-full max-w-[460px]">
        <div className="surface-cream rounded-3xl p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-full bg-[var(--color-leaf)] text-white">
              ✓
            </span>
            <span className="font-display text-[22px] leading-none">
              You&rsquo;re in.
            </span>
          </div>

          <p className="text-[15px] leading-relaxed text-[var(--color-ink-soft)]">
            We just texted both of you from a real iMessage handle. Open
            iMessage, find the new thread with{" "}
            <span className="font-medium text-[var(--color-ink)]">
              {yourName}
            </span>{" "}
            and{" "}
            <span className="font-medium text-[var(--color-ink)]">
              {partnerName}
            </span>
            , and say hi.
          </p>

          <div className="mt-5 rounded-xl border border-black/10 bg-white p-4">
            <div className="text-[12px] uppercase tracking-wider text-[var(--color-mute)]">
              Your shared bucket
            </div>
            <a
              href={result.dashboardUrl}
              className="mt-1 block break-all text-[14px] font-medium text-[var(--color-ink)] underline decoration-black/20 underline-offset-4"
            >
              {result.dashboardUrl}
            </a>
          </div>

          <div className="mt-6 flex gap-2">
            <a href={result.dashboardUrl} className="btn-depth-dark flex-1">
              Open dashboard
            </a>
            <Link href="/" className="btn-depth flex-1">
              Done
            </Link>
          </div>
        </div>

        <p className="mt-5 px-2 text-center text-[12.5px] leading-relaxed text-[var(--color-mute)]">
          If the text didn&rsquo;t arrive in a minute, check that you both
          have iMessage enabled — or text us back from the thread.
        </p>
      </div>
    );
  }

  // ── Wizard ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-[460px]">
      {/* Heading */}
      <div className="mb-6 text-center">
        <Link href="/" className="pill-badge mb-5 inline-flex">
          Setting up your shared memory
        </Link>
        <h1 className="font-display text-[36px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] sm:text-[44px]">
          Just a couple of{" "}
          <span className="italic text-[var(--color-mute)]">questions.</span>
        </h1>
      </div>

      {/* Card */}
      <div className="surface-cream rounded-3xl p-5 sm:p-7">
        {/* Progress */}
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between text-[12px] text-[var(--color-mute)]">
            <span>
              Step {stepIndex + 1} of {STEP_ORDER.length}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/8">
            <div
              className="h-full rounded-full bg-[var(--color-ink)] transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <form onSubmit={onFormSubmit} className="space-y-5">
          {step === "yourName" && (
            <Field
              label="What should we call you?"
              hint="First name is fine — your partner will see this too."
            >
              <input
                ref={inputRef}
                type="text"
                autoComplete="given-name"
                placeholder="e.g. Aidan"
                className="field-input"
                value={yourName}
                onChange={(e) => setYourName(e.target.value)}
                maxLength={40}
              />
            </Field>
          )}

          {step === "yourPhone" && (
            <Field
              label={`Hi ${yourName.trim() || "there"} — what's your number?`}
              hint="We'll text you from a real iMessage handle. US numbers can skip the +1."
            >
              <input
                ref={inputRef}
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="(415) 555-1234"
                className="field-input"
                value={yourPhone}
                onChange={(e) => setYourPhone(e.target.value)}
                aria-invalid={
                  yourPhone.length > 4 && !yourPhoneOk ? "true" : "false"
                }
              />
              {yourPhoneOk && (
                <span className="mt-2 inline-block text-[12.5px] text-[var(--color-mute)]">
                  → {prettyPhone(yourPhoneE164)}
                </span>
              )}
            </Field>
          )}

          {step === "partnerName" && (
            <Field
              label="Who are we adding?"
              hint="Your person — the one you want to remember things with."
            >
              <input
                ref={inputRef}
                type="text"
                autoComplete="off"
                placeholder="e.g. Sam"
                className="field-input"
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                maxLength={40}
              />
            </Field>
          )}

          {step === "partnerPhone" && (
            <Field
              label={`${partnerName.trim() || "Their"} number?`}
              hint="They'll get a friendly intro text. They don't need to install anything."
            >
              <input
                ref={inputRef}
                type="tel"
                autoComplete="off"
                inputMode="tel"
                placeholder="(415) 555-6789"
                className="field-input"
                value={partnerPhone}
                onChange={(e) => setPartnerPhone(e.target.value)}
                aria-invalid={
                  (partnerPhone.length > 4 && !partnerPhoneOk) || samePhone
                    ? "true"
                    : "false"
                }
              />
              {partnerPhoneOk && !samePhone && (
                <span className="mt-2 inline-block text-[12.5px] text-[var(--color-mute)]">
                  → {prettyPhone(partnerPhoneE164)}
                </span>
              )}
              {samePhone && (
                <span className="mt-2 inline-block text-[12.5px] text-[#b3261e]">
                  That&rsquo;s your number — try a different one.
                </span>
              )}
            </Field>
          )}

          {step === "review" && (
            <div className="space-y-4">
              <p className="text-[14px] text-[var(--color-ink-soft)]">
                Look right? We&rsquo;ll text both numbers from a real iMessage
                handle the moment you confirm.
              </p>

              <ul className="divide-y divide-black/10 rounded-xl border border-black/10 bg-white">
                <ReviewRow
                  label="You"
                  value={`${yourName.trim()} · ${prettyPhone(yourPhoneE164)}`}
                  onEdit={() => setStep("yourName")}
                />
                <ReviewRow
                  label="Partner"
                  value={`${partnerName.trim()} · ${prettyPhone(partnerPhoneE164)}`}
                  onEdit={() => setStep("partnerName")}
                />
              </ul>

              <p className="text-[12.5px] leading-relaxed text-[var(--color-mute)]">
                By continuing you agree we can text both numbers and store
                what you forward to the thread.
              </p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-[#b3261e]/30 bg-[#b3261e]/5 px-3 py-2 text-[13px] text-[#b3261e]"
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={back}
                className="btn-depth h-11 px-4 text-[14px]"
                disabled={submitting}
              >
                Back
              </button>
            )}
            <button
              type="submit"
              className="btn-depth-dark h-11 flex-1 text-[15px]"
              disabled={submitting || !canAdvance()}
            >
              {step === "review"
                ? submitting
                  ? "Sending the text…"
                  : "Send our intro text"
                : "Continue"}
            </button>
          </div>
        </form>
      </div>

      <p className="mt-5 px-2 text-center text-[12.5px] leading-relaxed text-[var(--color-mute)]">
        Already set up?{" "}
        <Link
          href="/"
          className="text-[var(--color-ink)] underline decoration-black/20 underline-offset-4 hover:decoration-black"
        >
          Go home
        </Link>
        .
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[15px] font-medium leading-snug text-[var(--color-ink)]">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-2 block text-[12.5px] leading-relaxed text-[var(--color-mute)]">
          {hint}
        </span>
      )}
    </label>
  );
}

function ReviewRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-[var(--color-mute)]">
          {label}
        </div>
        <div className="truncate text-[14px] text-[var(--color-ink)]">
          {value}
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="text-[12.5px] font-medium text-[var(--color-ink)] underline decoration-black/20 underline-offset-4 hover:decoration-black"
      >
        Edit
      </button>
    </li>
  );
}

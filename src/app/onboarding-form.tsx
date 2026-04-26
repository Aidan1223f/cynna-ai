"use client";

import { useState } from "react";

type Result = { coupleId: string; dashboardUrl: string };

export function OnboardingForm() {
  const [partnerA, setA] = useState("");
  const [partnerB, setB] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ partnerA, partnerB }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg =
          typeof json?.error === "string"
            ? json.error
            : JSON.stringify(json?.error ?? "something went wrong");
        setError(msg);
      } else {
        setResult(json as Result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
        <p className="font-medium">we just texted both of you. check iMessage.</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          your shared dashboard:{" "}
          <a
            className="underline"
            href={result.dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {result.dashboardUrl}
          </a>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">your number</span>
        <input
          type="tel"
          required
          placeholder="+14155551234"
          value={partnerA}
          onChange={(e) => setA(e.target.value)}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-base"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">your partner&apos;s number</span>
        <input
          type="tel"
          required
          placeholder="+14155556789"
          value={partnerB}
          onChange={(e) => setB(e.target.value)}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-base"
        />
      </label>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 font-medium disabled:opacity-50"
      >
        {submitting ? "starting…" : "start our bucket"}
      </button>
    </form>
  );
}

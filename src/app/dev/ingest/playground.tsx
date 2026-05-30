"use client";

import { useState } from "react";

type InspectResponse = {
  input: string;
  classified: unknown;
  unfurled: unknown;
  place: unknown;
  subject: unknown;
  timings_ms: { extract: number; classify: number; total: number };
};

const SAMPLES = [
  { label: "tiktok", url: "https://www.tiktok.com/@bonappetitmag/video/7290000000000000000" },
  { label: "ig reel", url: "https://www.instagram.com/reel/CzExampleReelId/" },
  { label: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  {
    label: "apple maps",
    url: "https://maps.apple.com/?q=Joe%27s%20Pizza&address=7+Carmine+St,+New+York,+NY+10014&ll=40.7305,-74.0027",
  },
];

export function IngestPlayground() {
  const [url, setUrl] = useState("");
  const [existing, setExisting] = useState("");
  const [skipAi, setSkipAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InspectResponse | null>(null);

  async function run(targetUrl: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/inspect-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          existingSubjects: existing
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          skipAi,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${res.status}: ${txt}`);
      }
      const json: InspectResponse = await res.json();
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 font-sans">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">ingest playground</h1>
        <p className="text-sm text-zinc-500">
          paste a tiktok / ig / youtube / apple maps URL — see exactly what each
          stage extracts. dry-run, no DB writes.
        </p>
      </header>

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) run(url.trim());
        }}
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          required
          className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-base"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 font-medium disabled:opacity-50"
        >
          {loading ? "…" : "inspect"}
        </button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {SAMPLES.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => {
              setUrl(s.url);
              run(s.url);
            }}
            className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {s.label}
          </button>
        ))}
      </div>

      <details className="mb-6 text-sm">
        <summary className="cursor-pointer text-zinc-500">advanced</summary>
        <div className="mt-2 space-y-2 rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
          <label className="block">
            <span className="block text-xs text-zinc-500 mb-1">
              existing subjects (comma-separated, simulates couple history)
            </span>
            <input
              type="text"
              value={existing}
              onChange={(e) => setExisting(e.target.value)}
              placeholder="Lisbon Restaurants, Movies To Watch"
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={skipAi}
              onChange={(e) => setSkipAi(e.target.checked)}
            />
            skip AI subject classification
          </label>
        </div>
      </details>

      {error && (
        <pre className="mb-4 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">
          {error}
        </pre>
      )}

      {result && (
        <div className="space-y-4">
          <Section title="classified" data={result.classified} />
          {result.place ? <Section title="place (apple_maps)" data={result.place} /> : null}
          {result.unfurled ? <Section title="unfurled" data={result.unfurled} /> : null}
          <Section title="subject (AI)" data={result.subject} />
          <Section title="timings (ms)" data={result.timings_ms} />
        </div>
      )}
    </main>
  );
}

function Section({ title, data }: { title: string; data: unknown }) {
  const json = JSON.stringify(data, null, 2) ?? "null";
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-1">{title}</h2>
      <pre className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3 text-xs overflow-auto whitespace-pre-wrap break-words">
        {json}
      </pre>
    </section>
  );
}

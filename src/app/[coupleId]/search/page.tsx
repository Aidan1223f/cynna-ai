import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { embed } from "@/lib/openai";
import { hasOpenAI } from "@/lib/env";
import { SaveItem, type CoupleRow, type SaveRow } from "../save-item";

export const dynamic = "force-dynamic";

type SearchHit = SaveRow & { similarity?: number };

async function vectorSearch(coupleId: string, query: string): Promise<SearchHit[]> {
  const vec = await embed(query);
  if (!vec) return ilikeSearch(coupleId, query);

  const { data, error } = await supabase.rpc("match_saves", {
    p_couple_id: coupleId,
    p_query: vec,
    p_limit: 20,
  });
  if (error) {
    console.error("[search] rpc failed, falling back to ILIKE", error);
    return ilikeSearch(coupleId, query);
  }
  return (data ?? []) as SearchHit[];
}

async function ilikeSearch(coupleId: string, query: string): Promise<SearchHit[]> {
  const like = `%${query.replace(/[%_]/g, "")}%`;
  const { data, error } = await supabase
    .from("saves")
    .select("*")
    .eq("couple_id", coupleId)
    .or(`raw_text.ilike.${like},transcript.ilike.${like},og_title.ilike.${like},og_description.ilike.${like}`)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[search] ilike failed", error);
    return [];
  }
  return (data ?? []) as SearchHit[];
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ coupleId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { coupleId } = await params;
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const { data: couple } = await supabase
    .from("couples")
    .select("*")
    .eq("id", coupleId)
    .single<CoupleRow>();
  if (!couple) notFound();

  const hits = query ? await vectorSearch(coupleId, query) : [];

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 font-sans">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">search your bucket</h1>
        <a
          href={`/${encodeURIComponent(coupleId)}`}
          className="text-sm underline text-zinc-600 dark:text-zinc-400"
        >
          back
        </a>
      </header>

      <form className="mb-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={hasOpenAI ? "what are we looking for?" : "search by keyword (no embeddings)"}
          className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-base"
        />
        <button
          type="submit"
          className="rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 font-medium"
        >
          search
        </button>
      </form>

      {!query ? (
        <p className="text-sm text-zinc-500">type something above.</p>
      ) : hits.length === 0 ? (
        <p className="text-sm text-zinc-500">no matches.</p>
      ) : (
        <ul className="space-y-3">
          {hits.map((s) => (
            <SaveItem key={s.id} save={s} couple={couple} />
          ))}
        </ul>
      )}
    </main>
  );
}

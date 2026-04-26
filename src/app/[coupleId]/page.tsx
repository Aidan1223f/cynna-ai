import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { SaveItem, type SaveRow, type CoupleRow } from "./save-item";

export const dynamic = "force-dynamic";

export default async function CouplePage({
  params,
}: {
  params: Promise<{ coupleId: string }>;
}) {
  const { coupleId } = await params;

  const { data: couple, error: coupleErr } = await supabase
    .from("couples")
    .select("*")
    .eq("id", coupleId)
    .single<CoupleRow>();

  if (coupleErr || !couple) notFound();

  const { data: saves, error: savesErr } = await supabase
    .from("saves")
    .select("*")
    .eq("couple_id", coupleId)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<SaveRow[]>();

  if (savesErr) {
    console.error("[dashboard] saves load failed", savesErr);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 font-sans">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">your bucket</h1>
        <a
          href={`/${encodeURIComponent(coupleId)}/search`}
          className="text-sm underline text-zinc-600 dark:text-zinc-400"
        >
          search
        </a>
      </header>

      {!saves || saves.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-12 text-center text-zinc-500">
          send the bot something in iMessage to get started.
        </div>
      ) : (
        <ul className="space-y-3">
          {saves.map((s) => (
            <SaveItem key={s.id} save={s} couple={couple} />
          ))}
        </ul>
      )}
    </main>
  );
}

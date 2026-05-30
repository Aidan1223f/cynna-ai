import Link from "next/link";
import { SiteHeader, SiteFooter } from "./site-chrome";

export default function Home() {
  return (
    <>
      <SiteHeader />

      <main className="bg-page-grain">
        {/* HERO */}
        <section className="mx-auto flex max-w-6xl flex-col items-center gap-7 px-5 pt-10 pb-16 sm:pt-16 sm:pb-24">
          <Link
            href="/get-started"
            className="pill-badge group transition-opacity hover:opacity-80"
          >
            <span>A new contact in your iMessage</span>
            <span
              aria-hidden
              className="text-[var(--color-mute)] transition-transform group-hover:translate-x-0.5"
            >
              &rarr;
            </span>
          </Link>

          <h1 className="text-balance text-center font-display text-[44px] leading-[1.05] tracking-[-0.025em] text-[var(--color-ink)] sm:text-[68px] sm:leading-[1.02]">
            Meet cynna,
            <br className="hidden sm:block" />{" "}
            <span className="italic text-[var(--color-mute)]">
              your shared memory.
            </span>
          </h1>

          <p className="max-w-[560px] text-balance text-center text-[16px] leading-relaxed text-[var(--color-ink-soft)] sm:text-[17px]">
            Add one number. Forward links, voice notes, and photos to the
            thread. Ask later &mdash; together &mdash; and we&rsquo;ll find it.
          </p>

          <div className="flex items-center gap-3">
            <Link
              href="/get-started"
              className="btn-depth-dark px-6 text-[15px]"
            >
              Get Started
            </Link>
            <Link href="/#how" className="btn-depth text-[15px]">
              How it works
            </Link>
          </div>

          {/* Hero card mock — an iMessage-ish thread */}
          <div className="mt-10 w-full max-w-[640px]">
            <div className="surface-cream rounded-3xl p-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.18)] sm:p-4">
              <div className="rounded-2xl border border-black/10 bg-white p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-full bg-[var(--color-cream)] text-[14px] font-medium">
                      cy
                    </span>
                    <div className="leading-tight">
                      <div className="text-[14px] font-medium text-[var(--color-ink)]">
                        cynna
                      </div>
                      <div className="text-[11px] text-[var(--color-mute)]">
                        iMessage &middot; just you two
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] text-[var(--color-mute)]">
                    today
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-end">
                    <div className="max-w-[78%] rounded-2xl rounded-br-md bg-[#0a84ff] px-3.5 py-2 text-[14.5px] text-white">
                      that ramen spot we walked past 🍜
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="max-w-[78%] rounded-2xl rounded-br-md bg-[#0a84ff] px-3.5 py-2 text-[14.5px] text-white">
                      maps.apple.com/?q=Ippudo+SF
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-[78%] rounded-2xl rounded-bl-md bg-[var(--color-cream-3)] px-3.5 py-2 text-[14.5px] text-[var(--color-ink)]">
                      saved to your bucket &mdash; i&rsquo;ll surface it next friday
                      when you&rsquo;re planning date night ✨
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="max-w-[78%] rounded-2xl rounded-br-md bg-[#0a84ff] px-3.5 py-2 text-[14.5px] text-white">
                      what was that book sarah recommended?
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-[78%] rounded-2xl rounded-bl-md bg-[var(--color-cream-3)] px-3.5 py-2 text-[14.5px] text-[var(--color-ink)]">
                      &ldquo;The Wager&rdquo; by david grann &mdash; you forwarded it
                      march 14
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* HOW */}
        <section
          id="how"
          className="mx-auto max-w-6xl px-5 pb-16 sm:pb-24"
        >
          <div className="mb-10 text-center">
            <h2 className="font-display text-[36px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] sm:text-[48px]">
              Three steps. <span className="italic text-[var(--color-mute)]">No app.</span>
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                n: "01",
                t: "Add the number",
                d: "Drop both your phone numbers in. We text you both from a real iMessage handle.",
              },
              {
                n: "02",
                t: "Forward anything",
                d: "Links, photos, voice notes, plain texts. Anything you want to remember together.",
              },
              {
                n: "03",
                t: "Ask later",
                d: "Search your shared bucket, or wait &mdash; we&rsquo;ll surface it when it&rsquo;s relevant.",
              },
            ].map((s) => (
              <div
                key={s.n}
                className="surface-cream flex flex-col gap-3 rounded-2xl p-6"
              >
                <div className="font-display text-[28px] leading-none text-[var(--color-mute)]">
                  {s.n}
                </div>
                <div className="text-[18px] font-medium text-[var(--color-ink)]">
                  {s.t}
                </div>
                <p
                  className="text-[14.5px] leading-relaxed text-[var(--color-ink-soft)]"
                  dangerouslySetInnerHTML={{ __html: s.d }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* QUOTE / FEATURE STRIP */}
        <section className="mx-auto max-w-6xl px-5 pb-16 sm:pb-24">
          <div className="surface-cream rounded-3xl px-8 py-12 sm:px-14 sm:py-20">
            <p className="mx-auto max-w-3xl text-balance text-center font-display text-[28px] leading-[1.2] tracking-[-0.02em] text-[var(--color-ink)] sm:text-[40px]">
              A shared memory{" "}
              <span className="italic text-[var(--color-mute)]">
                that knows you&rsquo;re a we
              </span>{" "}
              &mdash; and remembers what matters most.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/get-started"
                className="btn-depth-dark px-6 text-[15px]"
              >
                Start ours
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section
          id="faq"
          className="mx-auto max-w-3xl px-5 pb-20"
        >
          <h2 className="mb-8 text-center font-display text-[32px] leading-[1.05] tracking-[-0.02em] sm:text-[40px]">
            Questions
          </h2>
          <div className="divide-y divide-black/10 rounded-2xl border border-black/10">
            {[
              {
                q: "Do I need to download anything?",
                a: "No. cynna is a regular iMessage contact. Save the number, text it like a friend.",
              },
              {
                q: "Can my partner and I both text the same thread?",
                a: "Yes &mdash; that&rsquo;s the whole point. We create a 3-way iMessage with both of you and the bot.",
              },
              {
                q: "Is anyone reading our messages?",
                a: "Only the bot, and only to organize what you forward. Your private chats stay private.",
              },
              {
                q: "What if we break up?",
                a: "You can delete the thread and your bucket at any time.",
              },
            ].map((f) => (
              <details
                key={f.q}
                className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-medium text-[var(--color-ink)]">
                  {f.q}
                  <span
                    aria-hidden
                    className="text-[var(--color-mute)] transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p
                  className="mt-2 text-[14.5px] leading-relaxed text-[var(--color-ink-soft)]"
                  dangerouslySetInnerHTML={{ __html: f.a }}
                />
              </details>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

import { OnboardingForm } from "./onboarding-form";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-12 font-sans">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">cynna</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          a shared iMessage memory for couples. forward links, voice notes, and photos to the bot
          and find them later.
        </p>
      </header>
      <OnboardingForm />
      <footer className="text-xs text-zinc-500">
        we&apos;ll text both numbers from a real iMessage handle. hang up and check your phone.
      </footer>
    </main>
  );
}

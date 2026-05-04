import Image from "next/image";
import Link from "next/link";

function LogoMark({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      className="relative inline-block overflow-hidden rounded-full surface-cream"
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo-mark.png"
        alt=""
        fill
        sizes={`${size}px`}
        preload
        className="scale-[1.42] object-cover object-top"
      />
    </span>
  );
}

export function SiteHeader() {
  return (
    <header className="w-full">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark size={32} />
          <span className="font-display text-[22px] leading-none tracking-tight text-[var(--color-ink)]">
            love-send
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-[14px] font-medium text-[var(--color-ink)] sm:flex">
          <Link href="/#how" className="opacity-80 hover:opacity-100">
            How it works
          </Link>
          <Link href="/#faq" className="opacity-80 hover:opacity-100">
            FAQ
          </Link>
          <Link href="/get-started" className="opacity-80 hover:opacity-100">
            Log in
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/get-started" className="btn-depth text-[14px]">
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 w-full border-t border-black/5">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <div className="flex items-center gap-2">
            <LogoMark size={32} />
            <span className="font-display text-[22px] leading-none tracking-tight">
              love-send
            </span>
          </div>
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-[var(--color-ink-soft)]">
            A shared memory that lives in your iMessage thread. Forward
            anything you both want to remember — find it together later.
          </p>
        </div>

        <div className="text-[14px]">
          <h4 className="mb-3 font-medium text-[var(--color-ink)]">Product</h4>
          <ul className="space-y-2 text-[var(--color-ink-soft)]">
            <li>
              <Link href="/get-started" className="hover:text-[var(--color-ink)]">
                Get Started
              </Link>
            </li>
            <li>
              <Link href="/#how" className="hover:text-[var(--color-ink)]">
                How it works
              </Link>
            </li>
            <li>
              <Link href="/#faq" className="hover:text-[var(--color-ink)]">
                FAQ
              </Link>
            </li>
          </ul>
        </div>

        <div className="text-[14px]">
          <h4 className="mb-3 font-medium text-[var(--color-ink)]">Legal</h4>
          <ul className="space-y-2 text-[var(--color-ink-soft)]">
            <li>
              <a href="#" className="hover:text-[var(--color-ink)]">
                Privacy
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-[var(--color-ink)]">
                Terms
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-6xl border-t border-black/5 px-5 py-6 text-[12px] text-[var(--color-mute)]">
        © {new Date().getFullYear()} love-send · Made for two.
      </div>
    </footer>
  );
}

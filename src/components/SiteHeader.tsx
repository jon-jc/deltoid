import Link from "next/link";

export default function SiteHeader({ current }: { current?: "sources" | "about" }) {
  return (
    <header className="bar">
      <Link href="/" className="wordmark" aria-label="Deltoid, start screen">
        <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#1d6c65" />
          <path d="M7 9h18L16 25z" fill="#f3f0e8" />
          <circle cx="16" cy="14" r="2.6" fill="#b25a1c" />
        </svg>
        Deltoid
      </Link>
      <nav aria-label="Pages">
        <Link href="/sources" aria-current={current === "sources" ? "page" : undefined}>
          Sources
        </Link>
        <Link href="/about" aria-current={current === "about" ? "page" : undefined}>
          About
        </Link>
      </nav>
    </header>
  );
}

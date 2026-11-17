import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { ACCESSED, NOT_COVERED, SOURCES } from "@/content/clinical";

export const metadata: Metadata = {
  title: "Sources | Deltoid",
  description: "Every clinical statement in Deltoid, traced to the CDC source it was read from.",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function readable(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** The address without the scheme, for display. */
function pretty(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/, "");
}

export default function SourcesPage() {
  const list = Object.values(SOURCES);
  return (
    <>
      <SiteHeader current="sources" />
      <main className="doc">
        <div className="doc-inner">
          <Link href="/" className="top-link">
            <span aria-hidden="true">←</span> Back to the trainer
          </Link>
          <h1>Sources</h1>
          <p>
            Every site, needle length, gauge and angle in this trainer was read from the U.S. Centers for Disease Control
            and Prevention (CDC) pages and job aids below on {readable(ACCESSED)}. Nothing was written from memory.
            Guidance changes, so check the current CDC page and the procedures of your employer before relying on any
            value.
          </p>
          <ol className="source-list">
            {list.map((s) => (
              <li key={s.id} id={s.id}>
                <h3>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.title}
                  </a>
                </h3>
                <p className="source-meta">{s.publisher}</p>
                <p className="source-meta">
                  Dated {s.published} · Accessed {readable(s.accessed)}
                </p>
                <a className="source-url" href={s.url} target="_blank" rel="noopener noreferrer">
                  {pretty(s.url)}
                </a>
              </li>
            ))}
          </ol>

          <h2>Left out on purpose</h2>
          <p>Where CDC does not give a value, the trainer does not invent one.</p>
          <ul>
            {NOT_COVERED.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>

          <p>
            <Link href="/" className="back-link">
              Back to the trainer
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}

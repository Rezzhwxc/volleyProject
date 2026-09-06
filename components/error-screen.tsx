"use client";

import Link from "next/link";
import type { ErrorPresentation } from "@/lib/error-presentation";

const kindAccent: Record<ErrorPresentation["kind"], string> = {
  "not-found": "text-rvl-accent",
  unauthorized: "text-violet-600 dark:text-violet-400",
  forbidden: "text-rose-600 dark:text-rose-400",
  network: "text-sky-600 dark:text-sky-400",
  offline: "text-sky-700 dark:text-sky-300",
  timeout: "text-orange-600 dark:text-orange-400",
  "service-unavailable": "text-orange-600 dark:text-orange-400",
  "api-response": "text-orange-600 dark:text-orange-400",
  render: "text-fuchsia-600 dark:text-fuchsia-400",
  conflict: "text-amber-600 dark:text-amber-400",
  "bad-request": "text-amber-600 dark:text-amber-400",
  "d1-read-limit": "text-amber-600 dark:text-amber-400",
  "d1-write-limit": "text-amber-600 dark:text-amber-400",
  "sql-variables": "text-orange-600 dark:text-orange-400",
  "import-session-expired": "text-sky-600 dark:text-sky-400",
  database: "text-amber-600 dark:text-amber-400",
  unknown: "text-rvl-accent",
};

const actionClassName =
  "mt-2 inline-flex cursor-pointer items-center border-0 bg-rvl-accent-bg px-6 py-3.5 font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rvl-on-accent no-underline transition-opacity hover:opacity-85";

type ErrorScreenProps = {
  presentation: ErrorPresentation;
  detail?: string | null;
  digest?: string | null;
  onRetry?: () => void;
  /** Full viewport height — use for root-level errors outside site layout. */
  fullPage?: boolean;
};

export function ErrorScreen({
  presentation,
  detail = null,
  digest = null,
  onRetry,
  fullPage = false,
}: ErrorScreenProps) {
  const showTechnical = detail && detail !== presentation.body && detail !== presentation.summary;
  const showRetry =
    onRetry &&
    presentation.kind !== "not-found" &&
    presentation.kind !== "forbidden" &&
    presentation.kind !== "unauthorized";

  return (
    <section
      className={
        fullPage
          ? "flex min-h-screen flex-col items-start justify-center gap-5 bg-rvl-ground px-5 font-display text-rvl-ink sm:px-8 xl:px-14"
          : "flex flex-col items-start gap-5 px-5 py-16 font-display text-rvl-ink sm:px-8 xl:px-14"
      }
    >
      <span
        className={`font-mono text-[0.72rem] font-bold uppercase tracking-[0.24em] ${kindAccent[presentation.kind]}`}
      >
        {presentation.eyebrow}
      </span>
      <h1 className="m-0 max-w-[20ch] text-[2.2rem] font-black uppercase leading-[0.95] tracking-[-0.035em] sm:text-[2.8rem]">
        {presentation.title}
      </h1>
      <p className="m-0 max-w-[52ch] text-[1rem] leading-relaxed text-rvl-ink-2">{presentation.body}</p>
      {presentation.hint ? (
        <p className="m-0 max-w-[52ch] border-l-2 border-rvl-line pl-4 text-[0.92rem] leading-relaxed text-rvl-ink">
          {presentation.hint}
        </p>
      ) : null}
      {showTechnical ? (
        <details className="max-w-[min(100%,52rem)] rounded border border-rvl-line bg-rvl-panel/40 px-4 py-3">
          <summary className="cursor-pointer font-mono text-[0.68rem] uppercase tracking-[0.14em] text-rvl-dim">
            Technical details
          </summary>
          <pre className="mt-3 overflow-x-auto font-mono text-[0.72rem] leading-relaxed break-all whitespace-pre-wrap text-rvl-ink-2">
            {detail}
          </pre>
        </details>
      ) : null}
      {digest ? (
        <p className="m-0 font-mono text-[0.72rem] uppercase tracking-[0.14em] text-rvl-dim">
          Digest {digest}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {presentation.link ? (
          <Link href={presentation.link.href} className={actionClassName}>
            {presentation.link.label}
          </Link>
        ) : null}
        {showRetry ? (
          <button type="button" onClick={onRetry} className={actionClassName}>
            Try again
          </button>
        ) : null}
      </div>
    </section>
  );
}

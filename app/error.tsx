"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "app.error",
        message: error.message,
        digest: error.digest ?? null,
      }),
    );
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-start justify-center gap-5 bg-rvl-ground px-5 font-display text-rvl-ink sm:px-8 xl:px-14">
      <span className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.24em] text-rvl-accent">
        Error
      </span>
      <h1 className="m-0 text-[2.4rem] font-black uppercase leading-[0.95] tracking-[-0.035em] sm:text-[3rem]">
        This page could not load
      </h1>
      <p className="m-0 max-w-[52ch] text-[1rem] text-rvl-ink-2">
        {error.message || "The league data request failed. Try again, or check Worker logs if this keeps happening."}
      </p>
      {error.digest ? (
        <p className="m-0 font-mono text-[0.72rem] uppercase tracking-[0.14em] text-rvl-dim">
          Digest {error.digest}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="mt-2 cursor-pointer border-0 bg-rvl-accent-bg px-6 py-3.5 font-mono text-[0.72rem] font-bold uppercase tracking-[0.14em] text-rvl-on-accent transition-opacity hover:opacity-85"
      >
        Try again
      </button>
    </main>
  );
}

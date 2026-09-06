import type { ErrorPresentation } from "@/lib/error-presentation";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderErrorHtml(
  presentation: ErrorPresentation,
  detail: string | null = null,
): string {
  const showTechnical =
    detail && detail !== presentation.body && detail !== presentation.summary;
  const hint = presentation.hint
    ? `<p style="margin:0;max-width:52ch;border-left:2px solid #e5e0d8;padding-left:1rem;font-size:0.92rem;line-height:1.6;color:#2a2418">${escapeHtml(presentation.hint)}</p>`
    : "";
  const link = presentation.link
    ? `<a href="${escapeHtml(presentation.link.href)}" style="display:inline-flex;margin-top:0.5rem;background:#ffb020;color:#1a1208;padding:0.875rem 1.5rem;font-family:ui-monospace,monospace;font-size:0.72rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;text-decoration:none">${escapeHtml(presentation.link.label)}</a>`
    : "";
  const technical = showTechnical
    ? `<details style="max-width:52rem;border:1px solid #e5e0d8;border-radius:4px;padding:0.75rem 1rem;background:rgba(245,241,235,0.4)">
        <summary style="cursor:pointer;font-family:ui-monospace,monospace;font-size:0.68rem;letter-spacing:0.14em;text-transform:uppercase;color:#8a8278">Technical details</summary>
        <pre style="margin:0.75rem 0 0;overflow-x:auto;font-family:ui-monospace,monospace;font-size:0.72rem;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:#5c554c">${escapeHtml(detail)}</pre>
      </details>`
    : "";
  const retry = `<button type="button" onclick="location.reload()" style="display:inline-flex;margin-top:0.5rem;border:0;background:#ffb020;color:#1a1208;padding:0.875rem 1.5rem;font-family:ui-monospace,monospace;font-size:0.72rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;cursor:pointer">Try again</button>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(presentation.title)} · Volleyball 4-2 League</title>
  <style>
    body { margin: 0; min-height: 100vh; background: #faf8f5; color: #1a1208; font-family: "Segoe UI", system-ui, sans-serif; }
  </style>
</head>
<body>
  <main style="display:flex;min-height:100vh;flex-direction:column;justify-content:center;gap:1.25rem;padding:2rem 1.25rem;font-family:system-ui,sans-serif">
    <span style="font-family:ui-monospace,monospace;font-size:0.72rem;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;color:#b45f06">${escapeHtml(presentation.eyebrow)}</span>
    <h1 style="margin:0;max-width:18ch;font-size:clamp(2.2rem,6vw,2.8rem);font-weight:900;line-height:0.95;letter-spacing:-0.035em;text-transform:uppercase">${escapeHtml(presentation.title)}</h1>
    <p style="margin:0;max-width:52ch;font-size:1rem;line-height:1.6;color:#5c554c">${escapeHtml(presentation.body)}</p>
    ${hint}
    ${technical}
    <div style="display:flex;flex-wrap:wrap;gap:0.75rem">${link}${retry}</div>
  </main>
</body>
</html>`;
}

export function errorHtmlResponse(
  presentation: ErrorPresentation,
  detail: string | null,
  status = 500,
): Response {
  return new Response(renderErrorHtml(presentation, detail), {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function errorJsonResponse(presentation: ErrorPresentation, status = 500): Response {
  return Response.json(
    { error: { message: presentation.summary, kind: presentation.kind } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

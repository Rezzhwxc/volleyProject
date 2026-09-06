function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function trpcCause(error: unknown): string | null {
  if (!isRecord(error)) return null;
  const data = isRecord(error.data) ? error.data : null;
  if (!data) return null;
  return typeof data.cause === "string" && data.cause.length > 0 ? data.cause : null;
}

export function formatUnknownError(error: unknown): string {
  const cause = trpcCause(error);
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : null;
  const parts = [message, cause].filter((part, index, all): part is string => {
    return Boolean(part) && all.indexOf(part) === index;
  });
  if (parts.length > 0) return parts.join("\n\n");

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

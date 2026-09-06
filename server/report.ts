export function errorChain(error: unknown): string[] {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current != null && !seen.has(current) && messages.length < 8) {
    seen.add(current);
    if (current instanceof Error) {
      if (current.message) messages.push(current.message);
      current = current.cause;
      continue;
    }
    if (typeof current === "string" && current.length > 0) {
      messages.push(current);
      break;
    }
    break;
  }

  return messages;
}

export function errorDetail(error: unknown): string {
  return errorChain(error).join(" :: ");
}

function match(blob: string, pattern: RegExp): boolean {
  return pattern.test(blob);
}

export function explainError(error: unknown): { message: string; detail: string } {
  const chain = errorChain(error);
  const detail = chain.join(" :: ");
  const blob = detail.toLowerCase();

  if (match(blob, /free tier daily row read limit/)) {
    return {
      message:
        "The database hit today's free-tier read limit. Upgrade D1 to a paid Workers plan, or wait until midnight UTC.",
      detail,
    };
  }
  if (match(blob, /free tier daily row write limit/)) {
    return {
      message:
        "The database hit today's free-tier write limit. Upgrade D1 to a paid Workers plan, or wait until midnight UTC.",
      detail,
    };
  }
  if (match(blob, /too many sql variables/)) {
    return {
      message: "A database query used too many parameters for D1. Split the batch and retry.",
      detail,
    };
  }
  if (match(blob, /import session expired/)) {
    return {
      message: "Import session expired — run preview again.",
      detail,
    };
  }

  const d1Line = chain.find((line) => /d1_error|d1_exec_error|d1_type_error/i.test(line));
  if (d1Line) {
    const cleaned = d1Line.replace(/^.*?(D1_[A-Z_]+:\s*)/i, "").trim();
    return { message: cleaned || d1Line, detail };
  }

  const lastUseful = [...chain].reverse().find((line) => !/^Failed query:/i.test(line));
  return {
    message: lastUseful ?? chain[0] ?? "Something went wrong",
    detail,
  };
}

export function logError(scope: string, error: unknown, extra: Record<string, unknown> = {}): void {
  const explained = explainError(error);
  console.error(
    JSON.stringify({
      level: "error",
      scope,
      message: explained.message,
      detail: explained.detail,
      ...extra,
    }),
  );
}

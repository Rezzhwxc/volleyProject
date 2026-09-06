export type ErrorKind =
  | "not-found"
  | "unauthorized"
  | "forbidden"
  | "network"
  | "offline"
  | "timeout"
  | "service-unavailable"
  | "api-response"
  | "render"
  | "conflict"
  | "bad-request"
  | "d1-read-limit"
  | "d1-write-limit"
  | "sql-variables"
  | "import-session-expired"
  | "database"
  | "unknown";

export interface ErrorPresentation {
  kind: ErrorKind;
  eyebrow: string;
  title: string;
  body: string;
  hint: string | null;
  /** Short line for toasts, tRPC messages, and previews. */
  summary: string;
  /** Optional primary navigation action (sign in, home, etc.). */
  link?: { href: string; label: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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

function trpcData(error: unknown): { code?: string; cause?: string } | null {
  if (!isRecord(error)) return null;
  const data = isRecord(error.data) ? error.data : null;
  if (!data) return null;
  return {
    code: typeof data.code === "string" ? data.code : undefined,
    cause: typeof data.cause === "string" ? data.cause : undefined,
  };
}

function d1CauseMessage(chain: string[]): string | null {
  const d1Line = chain.find((line) => /d1_error|d1_exec_error|d1_type_error/i.test(line));
  if (!d1Line) return null;
  const cleaned = d1Line.replace(/^.*?(D1_[A-Z_]+:\s*)/i, "").trim();
  return cleaned || d1Line;
}

function lastUsefulMessage(chain: string[]): string {
  const lastUseful = [...chain].reverse().find((line) => !/^Failed query:/i.test(line));
  return lastUseful ?? chain[0] ?? "Something went wrong";
}

function genericNotFoundBody(message?: string): string {
  if (message && !/^not found$/i.test(message.trim())) {
    return message.endsWith(".") ? message : `${message}.`;
  }
  return "The link may be out of date, or the season, team, player or article it pointed at has been removed.";
}

export function presentNotFound(message?: string): ErrorPresentation {
  return {
    kind: "not-found",
    eyebrow: "404",
    title: "That page does not exist",
    body: genericNotFoundBody(message),
    hint: "Double-check the URL, or head back to the league home and browse from there.",
    summary: message && !/^not found$/i.test(message.trim()) ? message : "Page not found",
    link: { href: "/", label: "Back to the league" },
  };
}

function presentTrpcCode(code: string, message: string): ErrorPresentation | null {
  switch (code) {
    case "NOT_FOUND":
      return presentNotFound(message);
    case "UNAUTHORIZED":
      return {
        kind: "unauthorized",
        eyebrow: "Sign in required",
        title: "You need to be signed in",
        body: message || "This page or action requires a Roblox account linked to the league site.",
        hint: "Sign in with Roblox, then come back to this page.",
        summary: message || "Sign in required",
        link: { href: "/login", label: "Sign in" },
      };
    case "FORBIDDEN":
      return {
        kind: "forbidden",
        eyebrow: "Access denied",
        title: "You can't open this",
        body: message || "Your account does not have permission to view or change this.",
        hint: "If you think this is a mistake, ask a league admin to check your role.",
        summary: message || "Access denied",
        link: { href: "/", label: "Back to the league" },
      };
    case "CONFLICT":
      return {
        kind: "conflict",
        eyebrow: "Conflict",
        title: "That already exists",
        body: message || "The change conflicted with data that is already on the site.",
        hint: "Refresh the page and check whether the record was created anyway before retrying.",
        summary: message || "Conflict — refresh and try again",
      };
    case "BAD_REQUEST":
      return {
        kind: "bad-request",
        eyebrow: "Invalid request",
        title: "Something was wrong with that request",
        body: message || "The server rejected the input before it could run.",
        hint: "Check required fields and formats, then try again.",
        summary: message || "Invalid request",
      };
    default:
      return null;
  }
}

export function presentError(error: unknown): ErrorPresentation {
  const chain = errorChain(error);
  const detail = chain.join(" :: ");
  const blob = detail.toLowerCase();

  if (match(blob, /free tier daily row read limit/)) {
    return {
      kind: "d1-read-limit",
      eyebrow: "Database capacity",
      title: "We probably hit today's read limit",
      body: "League pages pull a lot of stats from Cloudflare D1. On the free tier there is a daily cap on row reads — once it is used up, data-heavy pages stop loading until the counter resets.",
      hint: "This usually clears after midnight UTC. Admins can remove the cap by upgrading the Cloudflare account to Workers Paid.",
      summary:
        "The database hit today's free-tier read limit. Upgrade D1 to a paid Workers plan, or wait until midnight UTC.",
    };
  }

  if (match(blob, /free tier daily row write limit/)) {
    return {
      kind: "d1-write-limit",
      eyebrow: "Database capacity",
      title: "We probably hit today's write limit",
      body: "Imports and edits write rows to Cloudflare D1. The free tier only allows a limited number of row writes per day.",
      hint: "Wait until midnight UTC or upgrade to Workers Paid, then retry the import or save.",
      summary:
        "The database hit today's free-tier write limit. Upgrade D1 to a paid Workers plan, or wait until midnight UTC.",
    };
  }

  if (match(blob, /too many sql variables/)) {
    return {
      kind: "sql-variables",
      eyebrow: "Query limit",
      title: "That batch was too large",
      body: "A database query tried to use more SQL parameters than D1 allows in a single statement.",
      hint: "Try a smaller import batch or split the operation and run it again.",
      summary: "A database query used too many parameters for D1. Split the batch and retry.",
    };
  }

  if (match(blob, /import session expired/)) {
    return {
      kind: "import-session-expired",
      eyebrow: "Sheet import",
      title: "Your import preview expired",
      body: "Loaded sheet data is kept on the server for about an hour while you review the import preview.",
      hint: "Go back to the import dialog and run preview again from the start.",
      summary: "Import session expired — run preview again.",
    };
  }

  if (
    match(blob, /\b404\b/) ||
    match(blob, /page could not be found/) ||
    match(blob, /cannot find .* on this server/) ||
    (match(blob, /not found/) && !match(blob, /column|table|route handler/))
  ) {
    return presentNotFound(lastUsefulMessage(chain));
  }

  if (
    match(blob, /failed to fetch/) ||
    match(blob, /networkerror when attempting to fetch/) ||
    match(blob, /network request failed/) ||
    match(blob, /fetch failed/) ||
    match(blob, /econnrefused/) ||
    match(blob, /enotfound/) ||
    match(blob, /socket hang up/) ||
    match(blob, /connection reset/)
  ) {
    return {
      kind: "network",
      eyebrow: "Connection",
      title: "We couldn't reach the server",
      body: "The browser did not get a response from the league API. That usually means a network blip, a dropped connection, or the site being temporarily unreachable.",
      hint: "Check your internet connection, disable VPN or ad blockers for this site, then try again.",
      summary: "Could not connect to the server. Check your connection and try again.",
    };
  }

  if (
    match(blob, /\boffline\b/) ||
    match(blob, /err_internet_disconnected/) ||
    match(blob, /internet connection appears to be offline/)
  ) {
    return {
      kind: "offline",
      eyebrow: "Offline",
      title: "You look offline",
      body: "League pages need a live connection to load stats, schedules, and articles from the server.",
      hint: "Reconnect to the internet, then reload this page.",
      summary: "You appear to be offline. Reconnect and try again.",
    };
  }

  if (
    match(blob, /aborterror/) ||
    match(blob, /\btimed out\b/) ||
    match(blob, /timeout/) ||
    match(blob, /etimedout/) ||
    match(blob, /deadline exceeded/)
  ) {
    return {
      kind: "timeout",
      eyebrow: "Timed out",
      title: "That took too long",
      body: "The request started but did not finish before the server or browser gave up waiting.",
      hint: "Try again in a moment. Heavy imports and busy database periods can take longer than usual.",
      summary: "The request timed out. Try again.",
    };
  }

  if (
    match(blob, /expected json from the api/) ||
    match(blob, /is not valid json/) ||
    match(blob, /unexpected token '<'/) ||
    match(blob, /<!doctype/)
  ) {
    return {
      kind: "api-response",
      eyebrow: "Bad response",
      title: "The API sent back something unexpected",
      body: "The site expected JSON data but got an HTML error page or another non-JSON response — often from a proxy, a deploy in progress, or a request that was too large.",
      hint: "Retry after a moment. If you were importing sheets, run preview again from the start.",
      summary: "The API returned an unexpected response. Try again.",
    };
  }

  if (
    match(blob, /\b502\b/) ||
    match(blob, /\b503\b/) ||
    match(blob, /\b504\b/) ||
    match(blob, /service unavailable/) ||
    match(blob, /bad gateway/) ||
    match(blob, /gateway timeout/)
  ) {
    return {
      kind: "service-unavailable",
      eyebrow: "Service unavailable",
      title: "The site is having a moment",
      body: "The server or an upstream service returned a temporary failure instead of the page data.",
      hint: "Wait a minute and try again. If imports or deploys were running, give them time to finish.",
      summary: "The service is temporarily unavailable. Try again shortly.",
    };
  }

  if (
    match(blob, /hydration failed/) ||
    match(blob, /error while hydrating/) ||
    match(blob, /server components render/) ||
    match(blob, /minified react error/) ||
    match(blob, /text content does not match/) ||
    match(blob, /failed to render/)
  ) {
    return {
      kind: "render",
      eyebrow: "Rendering",
      title: "This page broke while loading",
      body: "Something went wrong while the server or browser was building the page — often stale cached HTML, a bad deploy, or a component that crashed mid-render.",
      hint: "Hard refresh the page. If it keeps happening, try again after the next deploy.",
      summary: "The page failed to render. Refresh and try again.",
    };
  }

  const d1Message = d1CauseMessage(chain);
  if (d1Message) {
    return {
      kind: "database",
      eyebrow: "Database",
      title: "The database returned an error",
      body: d1Message,
      hint: "Try again in a moment. If this keeps happening, check Worker logs for the full D1 message.",
      summary: d1Message,
    };
  }

  const message = lastUsefulMessage(chain);
  return {
    kind: "unknown",
    eyebrow: "Error",
    title: "This page couldn't load",
    body: message,
    hint: "Try again, or check Worker logs if this keeps happening.",
    summary: message,
  };
}

/** Merge tRPC/client error shape (code, message, data.cause) before classification. */
export function presentUnknownError(error: unknown): ErrorPresentation {
  const trpc = trpcData(error);
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (trpc?.code) {
    const fromCode = presentTrpcCode(trpc.code, message);
    if (fromCode) {
      if (trpc.cause && !message.includes(trpc.cause)) {
        const refined = presentError(new Error(message, { cause: new Error(trpc.cause) }));
        if (refined.kind !== "unknown" && refined.kind !== "database") return refined;
      }
      return fromCode;
    }
  }

  if (error instanceof Error) {
    const cause = trpc?.cause ?? null;
    if (cause && !error.message.includes(cause)) {
      return presentError(new Error(error.message, { cause: new Error(cause) }));
    }
  }

  return presentError(error);
}

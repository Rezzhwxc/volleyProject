import { getDb } from "@db";
import { getAuth } from "@server/auth";
import { PORTAL_SKIP_REGION_HEADER, regionFromCookieHeader } from "@/lib/region";
import type { Context, TrpcUser } from "./init";

export async function createContext(
  headers: Headers,
  options: { skipRegion?: boolean } = {},
): Promise<Context> {
  const session = await getAuth().api.getSession({ headers });
  const user = session?.user
    ? ({
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: (session.user as { role?: string }).role ?? "user",
      } satisfies TrpcUser)
    : null;

  const skipRegion = options.skipRegion || headers.get(PORTAL_SKIP_REGION_HEADER) === "1";

  return {
    db: getDb(),
    user,
    region: skipRegion ? undefined : regionFromCookieHeader(headers.get("cookie")),
  };
}

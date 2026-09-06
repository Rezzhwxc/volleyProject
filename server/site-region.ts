import { cookies } from "next/headers";
import {
  parseSiteRegion,
  regionQuery,
  SITE_REGION_COOKIE,
  type SiteRegion,
} from "@/lib/region";

export async function getSiteRegion(): Promise<SiteRegion> {
  const jar = await cookies();
  return parseSiteRegion(jar.get(SITE_REGION_COOKIE)?.value);
}

export async function getSiteRegionQuery() {
  const selected = await getSiteRegion();
  return { selected, query: regionQuery(selected) };
}

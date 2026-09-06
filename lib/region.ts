export const SITE_REGIONS = ["all", "na", "eu", "as", "sa"] as const;
export type SiteRegion = (typeof SITE_REGIONS)[number];
export type MatchRegion = Exclude<SiteRegion, "all">;

export const DEFAULT_SITE_REGION: SiteRegion = "na";
export const SITE_REGION_COOKIE = "rvl-region";
export const SITE_REGION_MAX_AGE = 60 * 60 * 24 * 365;

const REGION_SET = new Set<string>(SITE_REGIONS);

export function parseSiteRegion(value: string | undefined | null): SiteRegion {
  const normalized = value?.trim().toLowerCase();
  if (normalized && REGION_SET.has(normalized)) return normalized as SiteRegion;
  return DEFAULT_SITE_REGION;
}

export function siteRegionCookie(region: SiteRegion) {
  return `${SITE_REGION_COOKIE}=${region};path=/;max-age=${SITE_REGION_MAX_AGE};samesite=lax`;
}

export function regionQuery(region: SiteRegion): { region: MatchRegion } | Record<string, never> {
  return region === "all" ? {} : { region };
}

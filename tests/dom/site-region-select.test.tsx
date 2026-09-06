import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as navigation from "next/navigation";
import { SiteRegionSelect } from "@components/site/site-region-select";
import { SITE_REGION_COOKIE } from "@/lib/region";

const refresh = vi.fn();

describe("SiteRegionSelect", () => {
  beforeEach(() => {
    refresh.mockReset();
    document.cookie = `${SITE_REGION_COOKIE}=;max-age=0;path=/`;
    vi.spyOn(navigation, "useRouter").mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
      refresh,
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    });
  });

  it("stores the chosen region and refreshes so queries rerun", async () => {
    const user = userEvent.setup();
    render(<SiteRegionSelect value="na" />);

    await user.click(screen.getByRole("button", { name: "EU" }));

    expect(document.cookie).toContain(`${SITE_REGION_COOKIE}=eu`);
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "EU" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("can clear the region filter with ALL", async () => {
    const user = userEvent.setup();
    render(<SiteRegionSelect value="na" />);

    await user.click(screen.getByRole("button", { name: "ALL" }));

    expect(document.cookie).toContain(`${SITE_REGION_COOKIE}=all`);
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "ALL" }).getAttribute("aria-pressed")).toBe("true");
  });
});

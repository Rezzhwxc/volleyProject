import { describe, expect, it } from "vitest";
import { errorChain, errorDetail, explainError } from "@server/report";
import { formatUnknownError } from "@/lib/format-error";

describe("explainError", () => {
  it("rewrites the D1 free-tier read limit into an actionable message", () => {
    const error = new Error(
      `Failed query: select "id" from "seasons"\nparams: `,
    );
    error.cause = new Error(
      "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.",
    );

    const explained = explainError(error);
    expect(explained.message).toContain("free-tier read limit");
    expect(explained.message).toContain("midnight UTC");
    expect(explained.detail).toContain("D1_ERROR");
  });

  it("rewrites the D1 free-tier write limit", () => {
    const explained = explainError(
      new Error("Your account has exceeded D1's free tier daily row write limit."),
    );
    expect(explained.message).toContain("free-tier write limit");
  });

  it("surfaces the D1 cause instead of the drizzle SQL dump", () => {
    const error = new Error('Failed query: select "id" from "awards"\nparams: ');
    error.cause = new Error("D1_ERROR: SQLITE_ERROR: no such column: missing");

    expect(explainError(error).message).toBe("SQLITE_ERROR: no such column: missing");
  });

  it("keeps an ordinary message", () => {
    expect(explainError(new Error("Season 2 already exists")).message).toBe("Season 2 already exists");
  });
});

describe("errorChain", () => {
  it("walks Error.cause", () => {
    const inner = new Error("inner");
    const outer = new Error("outer", { cause: inner });
    expect(errorChain(outer)).toEqual(["outer", "inner"]);
    expect(errorDetail(outer)).toBe("outer :: inner");
  });
});

describe("formatUnknownError", () => {
  it("includes tRPC data.cause under the short message", () => {
    const error = Object.assign(new Error("The database hit today's free-tier read limit."), {
      data: { cause: "Failed query: select id :: D1_ERROR: free tier daily row read limit" },
    });
    expect(formatUnknownError(error)).toContain("free-tier read limit");
    expect(formatUnknownError(error)).toContain("D1_ERROR");
  });
});

import { describe, expect, it } from "vitest";
import { presentError } from "@/lib/error-presentation";
import { renderErrorHtml } from "@server/error-html";

describe("renderErrorHtml", () => {
  it("renders a branded D1 read-limit page", () => {
    const error = new Error("Failed query: select id from seasons");
    error.cause = new Error("D1_ERROR: free tier daily row read limit");

    const html = renderErrorHtml(presentError(error), error.message);
    expect(html).toContain("read limit");
    expect(html).toContain("Database capacity");
    expect(html).toContain("Try again");
    expect(html).not.toContain("&lt;script");
  });

  it("escapes user-controlled error text", () => {
    const html = renderErrorHtml(
      presentError(new Error('<img src=x onerror=alert(1)>')),
      '<script>alert(1)</script>',
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

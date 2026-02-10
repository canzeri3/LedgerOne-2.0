const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");

/**
 * Helper: call buildAlertEmailHtml via tsx and return the HTML string.
 */
function renderTemplate(opts) {
  const json = JSON.stringify(opts);
  const script = [
    `import { buildAlertEmailHtml } from "${ROOT}/src/lib/emailTemplate.ts";`,
    `process.stdout.write(buildAlertEmailHtml(${json}));`,
  ].join("\n");

  const tmp = path.join(os.tmpdir(), `email-test-${Date.now()}.mts`);
  fs.writeFileSync(tmp, script, "utf-8");
  try {
    return execSync(`npx tsx "${tmp}"`, {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 15000,
    });
  } finally {
    fs.unlinkSync(tmp);
  }
}

const DEFAULT_OPTS = {
  headline: "Bitcoin trigger.",
  reviewUrl: "https://app.ledgerone.app/planner",
};

let html;

beforeAll(() => {
  html = renderTemplate(DEFAULT_OPTS);
});

describe("buildAlertEmailHtml", () => {
  test("returns valid HTML with doctype", () => {
    expect(html).toMatch(/^<!DOCTYPE html>/i);
    expect(html).toMatch(/<\/html>\s*$/);
  });

  test("contains the headline text", () => {
    expect(html).toContain("Bitcoin trigger.");
  });

  test("contains the review URL in an href", () => {
    expect(html).toContain('href="https://app.ledgerone.app/planner"');
  });

  test("contains the brand name LEDGERONE", () => {
    expect(html).toContain("LEDGERONE");
  });

  test("contains the CTA text", () => {
    expect(html).toContain("Review on LedgerOne");
  });

  test("contains a timestamp", () => {
    expect(html).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(html).toMatch(/UTC/);
  });

  test("contains the disclaimer", () => {
    expect(html).toContain("Not financial advice");
  });

  test("uses dark background colors", () => {
    expect(html).toContain("#131415");
    expect(html).toContain("#1f2021");
  });

  test("has no external CSS links", () => {
    expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet["']/i);
  });

  test("HTML-escapes special characters in headline", () => {
    const xss = renderTemplate({
      headline: '<script>alert("xss")</script>',
      reviewUrl: "https://example.com/a&b",
    });
    expect(xss).not.toContain("<script>");
    expect(xss).toContain("&lt;script&gt;");
    expect(xss).toContain("&amp;b");
  });

  test("accepts custom timestamp", () => {
    const custom = renderTemplate({
      ...DEFAULT_OPTS,
      timestamp: "2025-01-15 12:00:00 UTC",
    });
    expect(custom).toContain("2025-01-15 12:00:00 UTC");
  });

  test("contains Outlook VML fallback", () => {
    expect(html).toContain("v:roundrect");
  });

  test("contains LedgerOne.app footer", () => {
    expect(html).toContain("LedgerOne.app");
  });

  test("contains planner tagline", () => {
    expect(html).toMatch(/planner .* tracker/);
  });
});

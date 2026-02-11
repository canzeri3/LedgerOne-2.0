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
  newAlerts: [{ side: "Buy", coin: "bitcoin" }],
  currentAlerts: [
    { side: "Buy", coin: "bitcoin" },
    { side: "Sell", coin: "ethereum" },
    { side: "Cycle", coin: "solana" },
  ],
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

  test("contains the brand name LEDGERONE", () => {
    expect(html).toContain("LEDGERONE");
  });

  test("contains the review URL in an href", () => {
    expect(html).toContain('href="https://app.ledgerone.app/planner"');
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

  test("contains Outlook VML fallback", () => {
    expect(html).toContain("v:roundrect");
  });

  test("contains LedgerOne.app footer", () => {
    expect(html).toContain("LedgerOne.app");
  });

  test("contains planner tagline", () => {
    expect(html).toMatch(/planner .* tracker/);
  });

  // ─── New Alert section ─────────────────────────────────

  test("shows New Alert heading", () => {
    expect(html).toContain("New Alert");
  });

  test("shows new alert coin name (human readable)", () => {
    expect(html).toContain("Bitcoin");
  });

  test("shows BUY tag for new alert", () => {
    expect(html).toContain("BUY");
  });

  test("uses green color for BUY tag", () => {
    expect(html).toContain("#22c55e");
    expect(html).toContain("#052e16");
  });

  // ─── Outstanding Alerts section ────────────────────────

  test("shows Outstanding Alerts heading when there are extra alerts", () => {
    expect(html).toContain("Outstanding Alerts");
  });

  test("shows outstanding alert coins (Ethereum, Solana)", () => {
    expect(html).toContain("Ethereum");
    expect(html).toContain("Solana");
  });

  test("shows SELL and CYCLE tags in outstanding section", () => {
    expect(html).toContain("SELL");
    expect(html).toContain("CYCLE");
  });

  test("uses red color for SELL tag", () => {
    expect(html).toContain("#ef4444");
    expect(html).toContain("#450a0a");
  });

  test("uses amber color for CYCLE tag", () => {
    expect(html).toContain("#f59e0b");
    expect(html).toContain("#422006");
  });

  // ─── Deduplication ─────────────────────────────────────

  test("does not show new alert coin in outstanding section (dedup)", () => {
    // Bitcoin is the new alert — should NOT appear in outstanding
    // Outstanding should only have Ethereum and Solana
    const outstandingMatch = html.match(
      /Outstanding Alerts[\s\S]*$/i
    );
    if (outstandingMatch) {
      // The outstanding section should NOT contain a second Bitcoin row
      // (Bitcoin is already in "New Alert")
      const outstandingText = outstandingMatch[0];
      // Count Bitcoin occurrences in outstanding section only
      const btcCount = (outstandingText.match(/Bitcoin/g) || []).length;
      // Bitcoin should not appear in outstanding since it's already new
      expect(btcCount).toBe(0);
    }
  });

  // ─── Edge cases ────────────────────────────────────────

  test("omits Outstanding section when no extra alerts", () => {
    const noOutstanding = renderTemplate({
      newAlerts: [{ side: "Buy", coin: "bitcoin" }],
      currentAlerts: [{ side: "Buy", coin: "bitcoin" }],
      reviewUrl: "https://app.ledgerone.app/planner",
    });
    expect(noOutstanding).not.toContain("Outstanding Alerts");
  });

  test("HTML-escapes special characters in coin names", () => {
    const xss = renderTemplate({
      newAlerts: [{ side: "Buy", coin: "<script>alert('xss')</script>" }],
      currentAlerts: [],
      reviewUrl: "https://example.com/a&b",
    });
    expect(xss).not.toContain("<script>");
    expect(xss).toContain("&amp;b");
  });

  test("accepts custom timestamp", () => {
    const custom = renderTemplate({
      ...DEFAULT_OPTS,
      timestamp: "2025-01-15 12:00:00 UTC",
    });
    expect(custom).toContain("2025-01-15 12:00:00 UTC");
  });

  test("humanCoin converts hyphenated ids to title case", () => {
    const multi = renderTemplate({
      newAlerts: [{ side: "Buy", coin: "bitcoin-cash" }],
      currentAlerts: [],
      reviewUrl: "https://app.ledgerone.app/planner",
    });
    expect(multi).toContain("Bitcoin Cash");
  });
});

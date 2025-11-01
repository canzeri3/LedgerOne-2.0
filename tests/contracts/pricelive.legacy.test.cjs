// Contract tests for your legacy batched "price-live" route (adapter).
// Adjusted to match your current legacy shape: rows include "stale".

const HOST = process.env.TEST_HOST || "http://localhost:3000";

describe("LEGACY /api/price-live contract", () => {
  test("rows + updatedAt with expected row shape", async () => {
    // Support both ?id= and ?ids= styles by giving both; your adapter consolidates.
    const url = `${HOST}/api/price-live?id=bitcoin&id=ethereum&id=trx&ids=bitcoin,ethereum,trx`;
    const res = await fetch(url);
    expect(res.status).toBe(200);

    const j = await res.json();
    expect(Object.keys(j)).toEqual(["rows", "updatedAt"]);
    expect(Array.isArray(j.rows)).toBe(true);
    expect(typeof j.updatedAt).toBe("string");

    if (j.rows.length > 0) {
      const r = j.rows[0];
      // Legacy row keys include 'stale' in your environment
      expect(Object.keys(r)).toEqual(["id", "price", "pct24h", "price_24h", "source", "stale"]);
      expect(typeof r.id).toBe("string");
      if (r.price !== null) expect(typeof r.price).toBe("number");
      if (r.pct24h !== null) expect(typeof r.pct24h).toBe("number");
      if (r.price_24h !== null) expect(typeof r.price_24h).toBe("number");
      if (r.source !== null) expect(typeof r.source).toBe("string");
      expect(typeof r.stale).toBe("boolean");
    }
  });
});

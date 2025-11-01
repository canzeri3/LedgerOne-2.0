const HOST = process.env.TEST_HOST || "http://localhost:3000";
const COINS = ["bitcoin", "ethereum", "trx"];

describe("LEGACY /api/price/:id contract", () => {
  test.each(COINS)("shape for %s", async (id) => {
    const res = await fetch(`${HOST}/api/price/${id}`);
    expect(res.status).toBe(200);
    const j = await res.json();

    expect(Object.keys(j)).toEqual([
      "price",
      "change_24h_pct",
      "price_24h",
      "captured_at",
      "provider",
      "stale"
    ]);

    expect(typeof j.captured_at).toBe("string");
    expect(typeof j.stale).toBe("boolean");
    if (j.price !== null) expect(typeof j.price).toBe("number");
    if (j.change_24h_pct !== null) expect(typeof j.change_24h_pct).toBe("number");
    if (j.price_24h !== null) expect(typeof j.price_24h).toBe("number");
    if (j.provider !== null) expect(typeof j.provider).toBe("string");
  });
});


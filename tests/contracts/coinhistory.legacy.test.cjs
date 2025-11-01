// Contract tests for legacy coin-history route.
// Adjusted to match your current legacy shape: points are { t, v }.

const HOST = process.env.TEST_HOST || "http://localhost:3000";

describe("LEGACY /api/coin-history contract", () => {
  test("returns an array of {t,v}", async () => {
    const res = await fetch(`${HOST}/api/coin-history?id=bitcoin&tf=1d&limit=30`);
    expect(res.status).toBe(200);

    const arr = await res.json();
    expect(Array.isArray(arr)).toBe(true);

    if (arr.length > 0) {
      const p = arr[0];
      expect(Object.keys(p)).toEqual(["t", "v"]);
      expect(typeof p.t).toBe("number");
      expect(typeof p.v).toBe("number");
    }
  });
});

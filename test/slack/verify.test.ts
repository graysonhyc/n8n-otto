import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySlackRequest } from "@/lib/slack/verify";

const SECRET = "test_signing_secret";

function sign(body: string, timestamp: number): string {
  const hmac = createHmac("sha256", SECRET)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex");
  return `v0=${hmac}`;
}

describe("verifySlackRequest", () => {
  const body = "token=abc&command=/x";
  const now = 1_800_000_000_000; // fixed "now" in ms
  const ts = Math.floor(now / 1000);

  it("accepts a correctly signed, fresh request", () => {
    expect(
      verifySlackRequest({
        signingSecret: SECRET,
        timestamp: String(ts),
        body,
        signature: sign(body, ts),
        now,
      }),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(
      verifySlackRequest({
        signingSecret: SECRET,
        timestamp: String(ts),
        body: body + "&evil=1",
        signature: sign(body, ts),
        now,
      }),
    ).toBe(false);
  });

  it("rejects a stale timestamp (> 5 min)", () => {
    const oldTs = ts - 60 * 10;
    expect(
      verifySlackRequest({
        signingSecret: SECRET,
        timestamp: String(oldTs),
        body,
        signature: sign(body, oldTs),
        now,
      }),
    ).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(
      verifySlackRequest({
        signingSecret: SECRET,
        timestamp: String(ts),
        body,
        signature: "",
        now,
      }),
    ).toBe(false);
  });
});

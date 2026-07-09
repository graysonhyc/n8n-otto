import { createHmac, timingSafeEqual } from "node:crypto";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

// Verifies a Slack request signature per
// https://api.slack.com/authentication/verifying-requests-from-slack
export function verifySlackRequest(input: {
  signingSecret: string;
  timestamp: string | null;
  body: string;
  signature: string | null;
  now?: number;
}): boolean {
  const { signingSecret, timestamp, body, signature } = input;
  if (!timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;

  const now = input.now ?? Date.now();
  if (Math.abs(now - ts * 1000) > FIVE_MINUTES_MS) return false;

  const expected = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

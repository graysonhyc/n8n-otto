import { describe, it, expect } from "vitest";
import { deriveRelationships } from "@/lib/derive/relationships";
import {
  refundReviewAgent,
  refundExecution,
  dunningRetry,
  contentOrchestrator,
  formatPost,
  syncYoutube,
  syncLinkedin,
} from "@/lib/demo/fixtures";

const wfs = [
  refundReviewAgent,
  refundExecution,
  dunningRetry,
  contentOrchestrator,
  formatPost,
  syncYoutube,
  syncLinkedin,
];

const { edges, summary } = deriveRelationships(wfs);
const has = (kind: string, from: string, to: string) =>
  edges.some(
    (e) =>
      e.kind === kind &&
      ((e.from === from && e.to === to) || (e.from === to && e.to === from)),
  );

describe("deriveRelationships", () => {
  it("emits a structural:subworkflow edge for an Execute-Workflow call", () => {
    expect(has("structural:subworkflow", refundReviewAgent.id, refundExecution.id)).toBe(true);
  });

  it("emits a structural:subagent edge for a subworkflow exposed as an agent tool", () => {
    expect(has("structural:subagent", contentOrchestrator.id, formatPost.id)).toBe(true);
  });

  it("emits shared-credential edges between workflows sharing a credential id", () => {
    // cred_stripe is shared by the refund agent, refund execution and dunning retry
    expect(has("shared-credential", refundReviewAgent.id, refundExecution.id)).toBe(true);
    expect(has("shared-credential", refundExecution.id, dunningRetry.id)).toBe(true);
  });

  it("emits a shared-datasource edge for the same Google Sheet", () => {
    expect(has("shared-datasource", syncYoutube.id, syncLinkedin.id)).toBe(true);
  });

  it("summarises integration + connection counts", () => {
    expect(summary.integrationCount).toBeGreaterThan(0); // distinct credentials
    expect(summary.sharedCredentialCount).toBeGreaterThanOrEqual(1); // >=2 users
    expect(summary.connectionCount).toBeGreaterThanOrEqual(2); // structural edges
  });
});

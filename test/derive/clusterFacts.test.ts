import { describe, it, expect } from "vitest";
import { factLine, synopsis, promptFacts, type ClusterFacts } from "@/lib/derive/clusterFacts";

const shared: ClusterFacts = {
  members: [
    { id: "a", name: "Sync Youtube Content Database", trigger: "schedule", systems: ["YouTube", "Google Sheets"] },
    { id: "b", name: "Sync Linked Content Database", trigger: "schedule", systems: ["Google Sheets"] },
  ],
  basis: { viaCalls: false, sharedResource: { system: "Google Sheets", name: "Content Calendar & Database" } },
};

const calls: ClusterFacts = {
  members: [
    { id: "a", name: "Customer Onboarding", trigger: "webhook", systems: ["HubSpot"] },
    { id: "b", name: "Welcome Email Agent", trigger: "manual", systems: ["Gmail"] },
  ],
  basis: { viaCalls: true, sharedResource: null },
};

describe("clusterFacts", () => {
  it("factLine names the shared resource by its human label", () => {
    expect(factLine(shared)).toBe(
      "Shared Google Sheets: Content Calendar & Database · Sync Youtube Content Database, Sync Linked Content Database",
    );
  });

  it("factLine describes a call link", () => {
    expect(factLine(calls)).toMatch(/^Linked by Execute Workflow call ·/);
  });

  it("synopsis mentions both workflows, the shared resource, and an SOP framing", () => {
    const s = synopsis(shared);
    expect(s).toContain("Sync Youtube Content Database");
    expect(s).toContain("Sync Linked Content Database");
    expect(s).toContain("Content Calendar & Database");
    expect(s).toMatch(/SOP/);
  });

  it("synopsis references the target SOP for add-to-sop", () => {
    const s = synopsis({ ...shared, targetSopName: "Content Ops" });
    expect(s).toContain("Content Ops");
  });

  it("promptFacts lists each workflow's trigger + systems and the connection", () => {
    const p = promptFacts(shared);
    expect(p).toContain("trigger=schedule");
    expect(p).toContain("YouTube");
    expect(p).toContain('"Content Calendar & Database"');
  });
});

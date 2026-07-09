import { describe, expect, it } from "vitest";
import { unreachableNodes } from "@/lib/derive/structure";
import { customerOnboarding } from "@/lib/demo/fixtures";
import type { N8nWorkflow } from "@/lib/n8n/types";

// Mirrors the reported case: the edge into "Filter" was removed, so the whole
// Filter → Sheet → Upload chain is severed from the Schedule Trigger.
const severed: N8nWorkflow = {
  id: "wf_severed",
  name: "Sync Content",
  active: true,
  nodes: [
    { name: "Schedule Trigger", type: "n8n-nodes-base.scheduleTrigger" },
    { name: "Get channel", type: "n8n-nodes-base.youTube" },
    { name: "Get many videos", type: "n8n-nodes-base.youTube" },
    { name: "Filter", type: "n8n-nodes-base.filter" },
    { name: "Append row", type: "n8n-nodes-base.googleSheets" },
    { name: "Upload file", type: "n8n-nodes-base.googleDrive" },
    { name: "Note", type: "n8n-nodes-base.stickyNote" },
  ],
  connections: {
    "Schedule Trigger": { main: [[{ node: "Get channel", type: "main", index: 0 }]] },
    "Get channel": { main: [[{ node: "Get many videos", type: "main", index: 0 }]] },
    // "Get many videos" → "Filter" edge removed (dangling output)
    Filter: { main: [[{ node: "Append row", type: "main", index: 0 }]] },
    "Append row": { main: [[{ node: "Upload file", type: "main", index: 0 }]] },
  },
};

describe("unreachableNodes", () => {
  it("flags a subgraph severed from the trigger", () => {
    expect(unreachableNodes(severed).sort()).toEqual(["Append row", "Filter", "Upload file"]);
  });

  it("ignores sticky notes", () => {
    expect(unreachableNodes(severed)).not.toContain("Note");
  });

  it("returns nothing for a fully connected workflow", () => {
    expect(unreachableNodes(customerOnboarding)).toEqual([]);
  });

  it("does not flag reachable nodes", () => {
    const r = unreachableNodes(severed);
    expect(r).not.toContain("Get channel");
    expect(r).not.toContain("Get many videos");
  });
});

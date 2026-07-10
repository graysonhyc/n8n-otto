import { describe, it, expect } from "vitest";
import { workflowUrl, executionsUrl } from "@/lib/n8n/links";

describe("n8n links", () => {
  it("builds the workflow editor url", () => {
    expect(workflowUrl("https://n8n.example.com", "wf1")).toBe("https://n8n.example.com/workflow/wf1");
  });

  it("strips a trailing slash on the base", () => {
    expect(workflowUrl("https://n8n.example.com/", "wf1")).toBe("https://n8n.example.com/workflow/wf1");
  });

  it("builds the executions url for replaying failures by hand", () => {
    expect(executionsUrl("https://n8n.example.com", "wf1")).toBe(
      "https://n8n.example.com/workflow/wf1/executions",
    );
  });

  it("returns null when there is no base url", () => {
    expect(workflowUrl(undefined, "wf1")).toBeNull();
    expect(executionsUrl(null, "wf1")).toBeNull();
  });
});

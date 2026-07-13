import { describe, it, expect } from "vitest";
import { integrationForNode, workflowIntegrations } from "@/lib/derive/integrations";
import type { N8nNode, N8nWorkflow } from "@/lib/n8n/types";

const node = (type: string, extra: Partial<N8nNode> = {}): N8nNode =>
  ({ name: type, type, parameters: {}, ...extra }) as N8nNode;

describe("integrationForNode", () => {
  it("maps known brands with correct casing from the node type", () => {
    expect(integrationForNode(node("n8n-nodes-base.youTube"))).toBe("YouTube");
    expect(integrationForNode(node("n8n-nodes-base.googleDrive"))).toBe("Google Drive");
    expect(integrationForNode(node("n8n-nodes-base.googleSheets"))).toBe("Google Sheets");
    expect(integrationForNode(node("n8n-nodes-base.telegram"))).toBe("Telegram");
    expect(integrationForNode(node("n8n-nodes-base.hubspot"))).toBe("HubSpot");
  });

  it("resolves langchain sub-node providers (LLM / embeddings / tools)", () => {
    expect(integrationForNode(node("@n8n/n8n-nodes-langchain.lmChatOpenRouter"))).toBe("OpenRouter");
    expect(integrationForNode(node("@n8n/n8n-nodes-langchain.lmChatOpenAi"))).toBe("OpenAI");
    expect(integrationForNode(node("@n8n/n8n-nodes-langchain.embeddingsOpenAi"))).toBe("OpenAI");
  });

  it("resolves community-package nodes (e.g. Tavily)", () => {
    expect(integrationForNode(node("n8n-nodes-tavily.tavily"))).toBe("Tavily");
  });

  it("reads an httpRequest's predefined credential type", () => {
    const http = node("n8n-nodes-base.httpRequest", {
      parameters: { authentication: "predefinedCredentialType", nodeCredentialType: "serpApi" },
    });
    expect(integrationForNode(http)).toBe("SerpAPI");
  });

  it("reads the credential type when a credential is attached", () => {
    const n = node("n8n-nodes-base.someUnknownThing", {
      credentials: { telegramApi: { id: "c1", name: "Telegram bot" } },
    });
    expect(integrationForNode(n)).toBe("Telegram");
  });

  it("returns null for utility nodes (no integration)", () => {
    expect(integrationForNode(node("n8n-nodes-base.set"))).toBeNull();
    expect(integrationForNode(node("n8n-nodes-base.filter"))).toBeNull();
    expect(integrationForNode(node("n8n-nodes-base.scheduleTrigger"))).toBeNull();
    expect(integrationForNode(node("@n8n/n8n-nodes-langchain.agent"))).toBeNull();
  });
});

describe("workflowIntegrations", () => {
  it("collects distinct integrations across all nodes incl. sub-nodes, sorted", () => {
    const wf = {
      id: "w",
      name: "w",
      active: true,
      connections: {},
      nodes: [
        node("n8n-nodes-base.scheduleTrigger"),
        node("n8n-nodes-base.youTube"),
        node("n8n-nodes-base.googleDrive"),
        node("n8n-nodes-base.googleSheets"),
        node("n8n-nodes-base.httpRequest", {
          parameters: { authentication: "predefinedCredentialType", nodeCredentialType: "serpApi" },
        }),
        node("@n8n/n8n-nodes-langchain.lmChatOpenRouter"),
      ],
    } as unknown as N8nWorkflow;
    expect(workflowIntegrations(wf)).toEqual([
      "Google Drive",
      "Google Sheets",
      "OpenRouter",
      "SerpAPI",
      "YouTube",
    ]);
  });
});

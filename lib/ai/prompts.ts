import type { N8nWorkflow } from "@/lib/n8n/types";
import type { Classification } from "@/lib/n8n/types";

// Compact, structured description of a workflow for the model to reason over.
export function workflowDigest(workflow: N8nWorkflow, c: Classification): string {
  const nodes = workflow.nodes
    .map((n) => {
      const sys = n.type.split(".").pop();
      const prompt =
        (n.parameters?.options as { systemMessage?: string } | undefined)?.systemMessage;
      return `- ${n.name} (${sys})${prompt ? ` prompt="${prompt}"` : ""}`;
    })
    .join("\n");

  return [
    `Name: ${workflow.name}`,
    `Type: ${c.type}`,
    `Trigger: ${c.trigger.kind}`,
    `AI model: ${c.model ?? "none"}`,
    `Tools: ${c.toolNames.join(", ") || "none"}`,
    `Systems: ${c.systems.join(", ") || "none"}`,
    `Nodes:\n${nodes}`,
  ].join("\n");
}

export const ENRICH_SYSTEM = `You are a governance analyst for an automation platform.
Given a workflow's structure, explain it for a non-technical operations owner.
Be concise and specific. Return ONLY valid JSON, no prose, matching:
{
  "businessPurpose": string,        // one sentence, plain business language
  "input": string[],                // what data/events it consumes
  "output": string[],               // what it produces
  "aiBehaviour": string,            // if AI: does it summarise, recommend, decide, or act? Note human review. If no AI, "No AI involved."
  "ownerReasoning": string,         // which team likely owns this and why (systems, purpose)
  "runbook": string[]               // 3-6 concrete recovery steps if it fails
}`;

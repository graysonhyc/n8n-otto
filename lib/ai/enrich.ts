import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import type { N8nWorkflow } from "@/lib/n8n/types";
import { classify } from "@/lib/derive/classify";
import { ENRICH_SYSTEM, workflowDigest } from "./prompts";

export interface Enrichment {
  businessPurpose: string;
  input: string[];
  output: string[];
  aiBehaviour: string;
  ownerReasoning: string;
  runbook: string[];
  source: "ai" | "heuristic";
}

const Schema = z.object({
  businessPurpose: z.string(),
  input: z.array(z.string()),
  output: z.array(z.string()),
  aiBehaviour: z.string(),
  ownerReasoning: z.string(),
  runbook: z.array(z.string()),
});

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1";

// Cache by workflow id — enrichment is stable between edits within a session.
const cache = new Map<string, Enrichment>();

function heuristic(workflow: N8nWorkflow): Enrichment {
  const c = classify(workflow);
  const systems = c.systems.join(", ") || "no external systems";
  return {
    businessPurpose: `${c.type === "deterministic" ? "Automation" : "AI workflow"} triggered by ${c.trigger.kind}, touching ${systems}.`,
    input: [`${c.trigger.kind} trigger`],
    output: c.systems.length ? [`Updates in ${systems}`] : ["Internal result"],
    aiBehaviour: c.hasAgent
      ? `Agent with ${c.toolNames.length} tool(s). Review whether it decides or only recommends.`
      : c.usesAI
        ? "Uses an LLM step (assistive)."
        : "No AI involved.",
    ownerReasoning: workflow.homeProject?.name
      ? `In the ${workflow.homeProject.name} project.`
      : `Uses ${systems}.`,
    runbook: [
      "Check the trigger source is delivering events.",
      "Review the most recent execution error.",
      "Verify credentials for connected systems are valid.",
      "Re-run or replay failed executions once fixed.",
    ],
    source: "heuristic",
  };
}

export async function enrich(workflow: N8nWorkflow): Promise<Enrichment> {
  const cached = cache.get(workflow.id);
  if (cached) return cached;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const h = heuristic(workflow);
    cache.set(workflow.id, h);
    return h;
  }

  try {
    const client = new OpenAI({ apiKey });
    const c = classify(workflow);
    const res = await client.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ENRICH_SYSTEM },
        { role: "user", content: workflowDigest(workflow, c) },
      ],
    });
    const text = res.choices[0]?.message?.content ?? "{}";
    const parsed = Schema.parse(JSON.parse(text));
    const enrichment: Enrichment = { ...parsed, source: "ai" };
    cache.set(workflow.id, enrichment);
    return enrichment;
  } catch {
    const h = heuristic(workflow);
    cache.set(workflow.id, h);
    return h;
  }
}

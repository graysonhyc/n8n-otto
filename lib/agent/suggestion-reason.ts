import "server-only";
import type { ChatClient } from "./run";

const SYSTEM = `You help an operations team group related n8n automation workflows into SOPs (standard operating procedures) — one owned, documented business process.

Given a deterministic fact sheet about a few workflows that appear connected, write 1–2 concise sentences that:
- say WHAT these workflows collectively accomplish (the business outcome), and
- say WHY they belong together as one process worth owning as a unit.

Rules:
- Plain business language. No preamble, no bullet points, no headings.
- Use ONLY the facts given. Never invent workflow names, systems, owners, or metrics.
- Refer to workflows by name. Be specific about the shared resource or call relationship.`;

/**
 * One-shot LLM rationale for why a workflow cluster is a coherent SOP. Returns
 * the empty string on any failure so the caller can fall back to the
 * deterministic synopsis. `promptFacts` must be the derived fact sheet — never
 * raw workflow JSON — so the model can't hallucinate beyond ground truth.
 */
export async function generateRationale(
  promptFacts: string,
  client: ChatClient,
  model = process.env.OPENAI_MODEL || "gpt-4.1",
): Promise<string> {
  const res = await client.create({
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: promptFacts },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

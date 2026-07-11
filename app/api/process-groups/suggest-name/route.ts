import { NextResponse } from "next/server";
import { z } from "zod";
import { openaiFromEnv } from "@/lib/agent/openai";
import { generateSopName } from "@/lib/agent/suggestion-reason";
import type { ChatClient } from "@/lib/agent/run";

const Body = z.object({
  memberNames: z.array(z.string().min(1)).min(1),
  rationale: z.string().optional(),
});

const STOP = new Set([
  "agent", "workflow", "sync", "the", "and", "a", "an", "to", "for", "review",
  "bot", "run", "job", "new", "update", "process",
]);

// Deterministic fallback: the most common meaningful word across the member
// names (e.g. "Refund Review Agent" + "Refund Execution" → "Refund Process").
function fallbackName(memberNames: string[]): string {
  const counts = new Map<string, { raw: string; n: number }>();
  for (const name of memberNames) {
    for (const word of name.split(/\s+/)) {
      const key = word.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (key.length < 3 || STOP.has(key)) continue;
      const entry = counts.get(key) ?? { raw: word, n: 0 };
      entry.n += 1;
      counts.set(key, entry);
    }
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  if (top && top.n >= 2) return `${top.raw} Process`;
  // Otherwise lean on the first workflow's leading words.
  return memberNames[0].split(/\s+/).slice(0, 3).join(" ");
}

// Agent-recommended name to prefill the "Create SOP" form. Falls back to a
// deterministic shared-word name when the LLM is unavailable or errors.
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { memberNames, rationale } = parsed.data;

  const client = openaiFromEnv();
  if (client) {
    try {
      const facts = `Workflows: ${memberNames.join(", ")}\n${rationale ? `What they do: ${rationale}` : ""}`;
      const name = await generateSopName(facts, client as ChatClient);
      if (name) return NextResponse.json({ name });
    } catch {
      // fall through to deterministic name
    }
  }
  return NextResponse.json({ name: fallbackName(memberNames) });
}

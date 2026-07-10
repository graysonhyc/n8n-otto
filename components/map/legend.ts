import type { ColorBy, GraphNode } from "@/lib/derive/graph";
import type { WorkflowType } from "@/lib/n8n/types";
import { TYPE_LABEL } from "@/lib/format";

// All colors reference theme tokens from app/globals.css.
const RISK_COLOR = { high: "var(--color-danger)", medium: "var(--color-warn)", low: "var(--color-ok)" } as const;

const TYPE_COLOR: Record<WorkflowType, string> = {
  deterministic: "var(--color-info)",
  "ai-assisted": "var(--color-ai)",
  "ai-agent-tools": "var(--color-accent)",
};

// Deterministic palette for owner teams; null owner → faint grey.
const OWNER_PALETTE = [
  "var(--color-info)",
  "var(--color-ai)",
  "var(--color-ok)",
  "var(--color-warn)",
  "var(--color-accent)",
];
const UNOWNED_COLOR = "var(--color-faint)";

function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

export function ownerColor(team: string | null): string {
  if (!team) return UNOWNED_COLOR;
  return OWNER_PALETTE[hashIndex(team, OWNER_PALETTE.length)];
}

/** Accent color for a graph node under the given color-by mode. */
export function colorFor(node: GraphNode, mode: ColorBy): string {
  if (node.kind !== "workflow") return "var(--color-line-2)";
  switch (mode) {
    case "risk":
      return RISK_COLOR[node.risk];
    case "type":
      return TYPE_COLOR[node.type];
    case "owner":
      return ownerColor(node.ownerTeam);
  }
}

export interface LegendEntry {
  label: string;
  color: string;
}

/** Legend rows for the active color-by mode (owner rows derived from the graph). */
export function legendEntries(mode: ColorBy, nodes: GraphNode[]): LegendEntry[] {
  if (mode === "risk") {
    return [
      { label: "High risk", color: RISK_COLOR.high },
      { label: "Medium", color: RISK_COLOR.medium },
      { label: "Low", color: RISK_COLOR.low },
    ];
  }
  if (mode === "type") {
    return (Object.keys(TYPE_COLOR) as WorkflowType[]).map((t) => ({
      label: TYPE_LABEL[t],
      color: TYPE_COLOR[t],
    }));
  }
  // owner: distinct teams present + an "Unowned" row
  const teams = [
    ...new Set(
      nodes
        .filter((n) => n.kind === "workflow")
        .map((n) => (n.kind === "workflow" ? n.ownerTeam : null))
        .filter((t): t is string => !!t),
    ),
  ].sort();
  return [
    ...teams.map((t) => ({ label: t, color: ownerColor(t) })),
    { label: "Unowned", color: UNOWNED_COLOR },
  ];
}

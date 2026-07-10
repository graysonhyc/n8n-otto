import dagre from "@dagrejs/dagre";
import type { GraphNode, GraphEdge } from "@/lib/derive/graph";
import type { ProcessGroup } from "@/lib/derive/process";

export const WF_SIZE = { w: 200, h: 66 };
export const SYS_SIZE = { w: 148, h: 40 };
const GROUP_PAD = 22;
const GROUP_HEADER = 28;

export interface PositionedNode {
  id: string;
  x: number; // relative to parent when parentId set, else absolute
  y: number;
  width: number;
  height: number;
  parentId?: string;
}

export interface GroupBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
}

export interface LayoutResult {
  nodes: PositionedNode[];
  groups: GroupBox[];
}

const dim = (n: GraphNode) => (n.kind === "system" ? SYS_SIZE : WF_SIZE);

/**
 * Layered left→right layout via dagre, then bound each SOP group with a box and
 * reparent its member nodes to relative coordinates. dagre has no native nesting,
 * so grouping is applied as a post-pass over the flat layout.
 */
export function layout(nodes: GraphNode[], edges: GraphEdge[], groups: ProcessGroup[]): LayoutResult {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 42, ranksep: 96, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) g.setNode(n.id, { width: dim(n).w, height: dim(n).h });
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  // dagre gives center points; convert to top-left absolute boxes.
  const abs = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const n of nodes) {
    const p = g.node(n.id);
    const d = dim(n);
    abs.set(n.id, { x: p.x - d.w / 2, y: p.y - d.h / 2, w: d.w, h: d.h });
  }

  const memberOf = new Map<string, string>();
  for (const grp of groups) for (const wid of grp.workflowIds) memberOf.set(wid, grp.key);

  const groupBoxes: GroupBox[] = [];
  for (const grp of groups) {
    const members = grp.workflowIds
      .map((id) => abs.get(id))
      .filter((m): m is { x: number; y: number; w: number; h: number } => !!m);
    if (members.length === 0) continue;
    const minX = Math.min(...members.map((m) => m.x)) - GROUP_PAD;
    const minY = Math.min(...members.map((m) => m.y)) - GROUP_PAD - GROUP_HEADER;
    const maxX = Math.max(...members.map((m) => m.x + m.w)) + GROUP_PAD;
    const maxY = Math.max(...members.map((m) => m.y + m.h)) + GROUP_PAD;
    groupBoxes.push({ id: grp.key, x: minX, y: minY, width: maxX - minX, height: maxY - minY, name: grp.name });
  }
  const boxById = new Map(groupBoxes.map((b) => [b.id, b]));

  const positioned: PositionedNode[] = nodes.map((n) => {
    const a = abs.get(n.id)!;
    const parentId = memberOf.get(n.id);
    const box = parentId ? boxById.get(parentId) : undefined;
    if (box) {
      return { id: n.id, x: a.x - box.x, y: a.y - box.y, width: a.w, height: a.h, parentId };
    }
    return { id: n.id, x: a.x, y: a.y, width: a.w, height: a.h };
  });

  return { nodes: positioned, groups: groupBoxes };
}

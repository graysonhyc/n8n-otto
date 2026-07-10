// Domain types for the Backoffice store (kept independent of Prisma's generated types
// so the rest of the app doesn't import Prisma).

export type LinkRelation =
  | "depends-on"
  | "triggers"
  | "duplicate-of"
  | "part-of-process"
  | "shares-data-with";

export const LINK_RELATIONS: LinkRelation[] = [
  "depends-on",
  "triggers",
  "duplicate-of",
  "part-of-process",
  "shares-data-with",
];

export type OwnerSource = "inferred" | "confirmed";

export interface Owner {
  workflowId: string;
  team: string;
  slackChannelId: string | null;
  slackChannelName: string | null;
  escalationChannelId: string | null;
  confirmed: boolean;
  reasoning: string | null;
  source: OwnerSource;
}

export interface ManualLink {
  id: string;
  fromId: string;
  toId: string;
  relation: LinkRelation;
  source: string;
}

export type BriefItemStatus = "dismissed" | "acknowledged";

/** A hand-authored SOP ("epic"). */
export interface Sop {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string; // ISO
}

/** A workflow assigned into one SOP at an ordered step ("ticket"). */
export interface SopMember {
  workflowId: string;
  groupId: string;
  position: number;
}

/** An SOP with its ordered members, as rendered on the Process-groups board. */
export interface SopWithMembers extends Sop {
  members: SopMember[];
}

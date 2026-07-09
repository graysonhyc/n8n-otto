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

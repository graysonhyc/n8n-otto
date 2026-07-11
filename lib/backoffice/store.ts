import "server-only";
import { prisma } from "./db";
import type {
  BriefItemStatus,
  LinkRelation,
  ManualLink,
  Owner,
  OwnerSource,
  Sop,
  SopSuggestionStatus,
  SopWithMembers,
} from "./types";

// ---- Owners -----------------------------------------------------------------

export async function getOwner(workflowId: string): Promise<Owner | null> {
  const row = await prisma.ownerAssignment.findUnique({ where: { workflowId } });
  return row
    ? { ...row, source: row.source as OwnerSource }
    : null;
}

export async function getAllOwners(): Promise<Map<string, Owner>> {
  const rows = await prisma.ownerAssignment.findMany();
  return new Map(
    rows.map((r) => [r.workflowId, { ...r, source: r.source as OwnerSource }]),
  );
}

export async function setOwner(input: {
  workflowId: string;
  team: string;
  slackChannelId?: string | null;
  slackChannelName?: string | null;
  escalationChannelId?: string | null;
  confirmed?: boolean;
  reasoning?: string | null;
  source?: OwnerSource;
}): Promise<Owner> {
  const data = {
    team: input.team,
    slackChannelId: input.slackChannelId ?? null,
    slackChannelName: input.slackChannelName ?? null,
    escalationChannelId: input.escalationChannelId ?? null,
    confirmed: input.confirmed ?? true,
    reasoning: input.reasoning ?? null,
    source: input.source ?? "confirmed",
  };
  const row = await prisma.ownerAssignment.upsert({
    where: { workflowId: input.workflowId },
    create: { workflowId: input.workflowId, ...data },
    update: data,
  });
  return { ...row, source: row.source as OwnerSource };
}

// ---- Manual links -----------------------------------------------------------

export async function getLinksFor(workflowId: string): Promise<ManualLink[]> {
  const rows = await prisma.workflowLink.findMany({
    where: { OR: [{ fromId: workflowId }, { toId: workflowId }] },
  });
  return rows.map((r) => ({ ...r, relation: r.relation as LinkRelation }));
}

export async function getAllLinks(): Promise<ManualLink[]> {
  const rows = await prisma.workflowLink.findMany();
  return rows.map((r) => ({ ...r, relation: r.relation as LinkRelation }));
}

export async function addLink(input: {
  fromId: string;
  toId: string;
  relation: LinkRelation;
}): Promise<ManualLink> {
  const row = await prisma.workflowLink.upsert({
    where: {
      fromId_toId_relation: {
        fromId: input.fromId,
        toId: input.toId,
        relation: input.relation,
      },
    },
    create: { ...input, source: "manual" },
    update: {},
  });
  return { ...row, relation: row.relation as LinkRelation };
}

export async function removeLink(id: string): Promise<void> {
  await prisma.workflowLink.delete({ where: { id } });
}

// ---- Snapshots (change detection) ------------------------------------------

export async function getSnapshot(
  workflowId: string,
): Promise<{ hash: string; json: string } | null> {
  const row = await prisma.workflowSnapshot.findUnique({ where: { workflowId } });
  return row ? { hash: row.hash, json: row.json } : null;
}

export async function putSnapshot(
  workflowId: string,
  hash: string,
  json: string,
): Promise<void> {
  await prisma.workflowSnapshot.upsert({
    where: { workflowId },
    create: { workflowId, hash, json },
    update: { hash, json },
  });
}

// ---- Slack install ----------------------------------------------------------

export async function getSlackInstall(): Promise<{
  teamId: string;
  botToken: string;
  botUserId: string;
} | null> {
  return prisma.slackInstall.findFirst();
}

export async function setSlackInstall(input: {
  teamId: string;
  botToken: string;
  botUserId: string;
}): Promise<void> {
  await prisma.slackInstall.upsert({
    where: { teamId: input.teamId },
    create: input,
    update: { botToken: input.botToken, botUserId: input.botUserId },
  });
}

// ---- Brief item state -------------------------------------------------------

export async function getBriefStates(): Promise<Map<string, BriefItemStatus>> {
  const rows = await prisma.briefItemState.findMany();
  return new Map(rows.map((r) => [r.key, r.status as BriefItemStatus]));
}

export async function setBriefState(
  key: string,
  status: BriefItemStatus,
): Promise<void> {
  await prisma.briefItemState.upsert({
    where: { key },
    create: { key, status },
    update: { status },
  });
}

// ---- Owner-suggestion dismissals --------------------------------------------
// Reuses the generic BriefItemState key→status table (no dedicated migration).
// A dismissed owner suggestion is keyed `owner-suggest:<workflowId>`.

const OWNER_SUGGEST_PREFIX = "owner-suggest:";

export async function dismissOwnerSuggestion(workflowId: string): Promise<void> {
  const key = OWNER_SUGGEST_PREFIX + workflowId;
  await prisma.briefItemState.upsert({
    where: { key },
    create: { key, status: "dismissed" },
    update: { status: "dismissed" },
  });
}

export async function getDismissedOwnerSuggestions(): Promise<Set<string>> {
  const rows = await prisma.briefItemState.findMany({
    where: { key: { startsWith: OWNER_SUGGEST_PREFIX } },
  });
  return new Set(rows.map((r) => r.key.slice(OWNER_SUGGEST_PREFIX.length)));
}

// ---- SOP suggestion state ---------------------------------------------------

export async function getSuggestionStates(): Promise<Map<string, SopSuggestionStatus>> {
  const rows = await prisma.sopSuggestionState.findMany();
  return new Map(rows.map((r) => [r.id, r.status as SopSuggestionStatus]));
}

export async function setSuggestionState(
  id: string,
  status: SopSuggestionStatus,
): Promise<void> {
  await prisma.sopSuggestionState.upsert({
    where: { id },
    create: { id, status },
    update: { status },
  });
}

export async function getSuggestionReasons(): Promise<Map<string, string>> {
  const rows = await prisma.sopSuggestionReason.findMany();
  return new Map(rows.map((r) => [r.id, r.rationale]));
}

export async function setSuggestionReason(id: string, rationale: string): Promise<void> {
  await prisma.sopSuggestionReason.upsert({
    where: { id },
    create: { id, rationale },
    update: { rationale },
  });
}

// ---- SOP process groups (hand-authored epic → tickets) ---------------------

function toSopWithMembers(r: {
  id: string;
  name: string;
  description: string | null;
  updatedAt: Date;
  members: { workflowId: string; groupId: string; position: number }[];
}): SopWithMembers {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    updatedAt: r.updatedAt.toISOString(),
    members: r.members
      .map((m) => ({ workflowId: m.workflowId, groupId: m.groupId, position: m.position }))
      .sort((a, b) => a.position - b.position),
  };
}

/** All SOPs with their members. */
export async function listSops(): Promise<SopWithMembers[]> {
  const rows = await prisma.processGroup.findMany({
    include: { members: { orderBy: { position: "asc" } } },
    orderBy: { name: "asc" },
  });
  return rows.map(toSopWithMembers);
}

/** A single SOP with its members, or null if it does not exist. */
export async function getSop(id: string): Promise<SopWithMembers | null> {
  const row = await prisma.processGroup.findUnique({
    where: { id },
    include: { members: { orderBy: { position: "asc" } } },
  });
  return row ? toSopWithMembers(row) : null;
}

export async function createSop(
  name: string,
  memberIds: string[] = [],
  description?: string | null,
): Promise<Sop> {
  const row = await prisma.processGroup.create({ data: { name, description: description ?? null } });
  for (let i = 0; i < memberIds.length; i++) await assignMember(memberIds[i], row.id, i);
  return { id: row.id, name: row.name, description: row.description, updatedAt: row.updatedAt.toISOString() };
}

export async function updateSop(
  id: string,
  patch: { name?: string; description?: string | null },
): Promise<void> {
  await prisma.processGroup.update({ where: { id }, data: patch });
}

export async function deleteSop(id: string): Promise<void> {
  // Members cascade-delete via the FK.
  await prisma.processGroup.delete({ where: { id } });
}

/**
 * Assign a workflow into an SOP. Because workflowId is the member PK, assigning a
 * workflow that already belongs to another SOP MOVES it (upsert) — enforcing the
 * one-workflow-one-SOP rule. Appends to the end unless a position is given.
 */
export async function assignMember(
  workflowId: string,
  groupId: string,
  position?: number,
): Promise<void> {
  const pos =
    position ??
    ((await prisma.processGroupMember.count({ where: { groupId } })) as number);
  await prisma.processGroupMember.upsert({
    where: { workflowId },
    create: { workflowId, groupId, position: pos },
    update: { groupId, position: pos },
  });
}

export async function unassignMember(workflowId: string): Promise<void> {
  await prisma.processGroupMember.delete({ where: { workflowId } });
}

/** Rewrite step order for a group from an ordered list of workflow ids. */
export async function reorderMembers(
  groupId: string,
  orderedWorkflowIds: string[],
): Promise<void> {
  await prisma.$transaction(
    orderedWorkflowIds.map((workflowId, position) =>
      prisma.processGroupMember.updateMany({
        where: { workflowId, groupId },
        data: { position },
      }),
    ),
  );
}

// ---- Real-time notification state ------------------------------------------

export async function getNotifiedKeys(): Promise<Set<string>> {
  const rows = await prisma.briefNotification.findMany({ select: { key: true } });
  return new Set(rows.map((r) => r.key));
}

export async function markNotified(key: string): Promise<void> {
  await prisma.briefNotification.upsert({ where: { key }, create: { key }, update: {} });
}

export async function clearNotified(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await prisma.briefNotification.deleteMany({ where: { key: { in: keys } } });
}

export async function getLastSweepAt(): Promise<Date | null> {
  const row = await prisma.notifySweep.findUnique({ where: { id: "default" } });
  return row?.lastRunAt ?? null;
}

export async function touchSweep(): Promise<void> {
  const now = new Date();
  await prisma.notifySweep.upsert({
    where: { id: "default" },
    create: { id: "default", lastRunAt: now },
    update: { lastRunAt: now },
  });
}

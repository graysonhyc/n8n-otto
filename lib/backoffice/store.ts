import "server-only";
import { prisma } from "./db";
import type {
  BriefItemStatus,
  LinkRelation,
  ManualLink,
  Owner,
  OwnerSource,
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

// ---- Process group names (SOP clusters) ------------------------------------

export async function getProcessGroupNames(): Promise<Map<string, string>> {
  const rows = await prisma.processGroup.findMany();
  return new Map(rows.map((r) => [r.key, r.name]));
}

export async function setProcessGroupName(key: string, name: string): Promise<void> {
  await prisma.processGroup.upsert({
    where: { key },
    create: { key, name },
    update: { name },
  });
}

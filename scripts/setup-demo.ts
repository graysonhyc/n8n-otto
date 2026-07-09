/**
 * Demo setup: seeds team → Slack-channel routing for the anchor workflows.
 * If a Slack workspace is connected, it also creates the demo channels and
 * captures their IDs so alerts route live.
 *
 * Run:  pnpm setup:demo
 *
 * Standalone (uses PrismaClient + WebClient directly) so it doesn't import
 * `server-only` modules.
 */
import { PrismaClient } from "@prisma/client";
import { WebClient } from "@slack/web-api";

const prisma = new PrismaClient();

const CHANNELS = [
  "n8n-backoffice",
  "support-ops",
  "revops",
  "sales-ops",
  "people-ops",
  "finance",
  "cs-alerts",
];

// workflowId → { team, channel name }
const ROUTING: Record<string, { team: string; channel: string }> = {
  wf_refund_review_agent: { team: "Support Ops", channel: "support-ops" },
  wf_customer_onboarding: { team: "RevOps", channel: "revops" },
  wf_welcome_email_agent: { team: "RevOps", channel: "revops" },
  wf_lead_routing: { team: "Sales Ops", channel: "sales-ops" },
  wf_pto_approval_bot: { team: "People Ops", channel: "people-ops" },
};

async function ensureChannels(client: WebClient): Promise<Map<string, string>> {
  const byName = new Map<string, string>();

  // Collect existing first.
  let cursor: string | undefined;
  do {
    const res = await client.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    for (const c of res.channels ?? []) if (c.name && c.id) byName.set(c.name, c.id);
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);

  for (const name of CHANNELS) {
    if (byName.has(name)) continue;
    try {
      const res = await client.conversations.create({ name });
      if (res.channel?.id) byName.set(name, res.channel.id);
      console.log(`  created #${name}`);
    } catch (e) {
      console.log(`  could not create #${name} (${(e as Error).message}) — create it manually and re-run`);
    }
  }
  return byName;
}

async function main() {
  const install = await prisma.slackInstall.findFirst();
  let channelIds = new Map<string, string>();

  if (install) {
    console.log("Slack connected — ensuring demo channels…");
    channelIds = await ensureChannels(new WebClient(install.botToken));
  } else {
    console.log("Slack not connected — seeding team labels only (no channel routing).");
  }

  for (const [workflowId, { team, channel }] of Object.entries(ROUTING)) {
    const slackChannelId = channelIds.get(channel) ?? null;
    await prisma.ownerAssignment.upsert({
      where: { workflowId },
      create: {
        workflowId,
        team,
        slackChannelId,
        slackChannelName: slackChannelId ? `#${channel}` : null,
        confirmed: true,
        source: "confirmed",
      },
      update: {
        team,
        slackChannelId,
        slackChannelName: slackChannelId ? `#${channel}` : null,
      },
    });
    console.log(`  ${workflowId} → ${team}${slackChannelId ? ` (#${channel})` : ""}`);
  }

  console.log("Done.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

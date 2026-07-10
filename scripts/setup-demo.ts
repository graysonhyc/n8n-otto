/**
 * Demo setup: ensures the demo Slack channels exist (so the owner picker and
 * alert routing have targets). Owners are intentionally NOT seeded — assign
 * them yourself from the Registry so nothing is pre-classified for you.
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
    console.log("Slack not connected — skipping channel creation.");
  }

  console.log(
    "Owners left unassigned — assign them yourself from the Registry.",
  );
  console.log("Done.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

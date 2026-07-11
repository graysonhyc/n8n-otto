import "server-only";
import { loadInstance } from "./source";
import {
  getAllOwners,
  getDismissedOwnerSuggestions,
  getLinksFor,
  getOwner,
  getSlackInstall,
} from "@/lib/backoffice/store";
import { composeRegistry, type RegistryItem } from "@/lib/derive/registry";
import { composeDetail, type DetailModel } from "@/lib/derive/detail";
import { enrich, type Enrichment } from "@/lib/ai/enrich";
import { listSlackChannels } from "@/lib/slack/channels";
import { suggestOwnerChannels, type SuggestInput } from "@/lib/ai/suggestOwnerChannels";

export interface RegistryView {
  items: RegistryItem[];
  live: boolean;
}

export async function loadRegistry(): Promise<RegistryView> {
  const [{ workflows, executions, live }, owners] = await Promise.all([
    loadInstance(),
    getAllOwners(),
  ]);
  const items = composeRegistry({ workflows, executions, owners, now: Date.now() });
  const withSuggestions = await attachOwnerSuggestions(items);
  return { items: withSuggestions, live };
}

// Attach an LLM-judged owner-channel suggestion to each unowned, non-dismissed
// workflow. Fail-soft: any missing piece (no Slack install, no channels, LLM
// error) simply yields no suggestions and the rows fall back to "Unassigned".
async function attachOwnerSuggestions(items: RegistryItem[]): Promise<RegistryItem[]> {
  const install = await getSlackInstall();
  if (!install) return items;

  const dismissed = await getDismissedOwnerSuggestions();
  const unowned = items.filter((i) => !i.owner && !dismissed.has(i.id));
  if (unowned.length === 0) return items;

  let channels;
  try {
    channels = await listSlackChannels(install.botToken);
  } catch {
    return items;
  }
  if (channels.length === 0) return items;

  const inputs: SuggestInput[] = unowned.map((i) => ({
    id: i.id,
    name: i.name,
    systems: i.systems,
    tags: i.tags,
    project: i.project,
    team: i.suggestedOwner?.team ?? null,
    hasAgent: i.hasAgent,
  }));
  const suggestions = await suggestOwnerChannels(inputs, channels);
  if (suggestions.size === 0) return items;

  return items.map((i) =>
    i.owner ? i : { ...i, suggestedChannel: suggestions.get(i.id) ?? null },
  );
}

export async function loadDetail(id: string): Promise<DetailModel | null> {
  const [{ workflows, executions }, owner, manualLinks] = await Promise.all([
    loadInstance(),
    getOwner(id),
    getLinksFor(id),
  ]);
  const workflow = workflows.find((w) => w.id === id);
  if (!workflow) return null;
  return composeDetail({
    workflow,
    allWorkflows: workflows,
    executions,
    owner,
    manualLinks,
    now: Date.now(),
  });
}

export interface DetailPage {
  detail: DetailModel;
  enrichment: Enrichment;
  workflowOptions: { id: string; name: string }[];
}

export async function loadDetailPage(id: string): Promise<DetailPage | null> {
  const [{ workflows, executions }, owner, manualLinks] = await Promise.all([
    loadInstance(),
    getOwner(id),
    getLinksFor(id),
  ]);
  const workflow = workflows.find((w) => w.id === id);
  if (!workflow) return null;

  const detail = composeDetail({
    workflow,
    allWorkflows: workflows,
    executions,
    owner,
    manualLinks,
    now: Date.now(),
  });
  const enrichment = await enrich(workflow);
  const workflowOptions = workflows
    .filter((w) => w.id !== id)
    .map((w) => ({ id: w.id, name: w.name }));

  return { detail, enrichment, workflowOptions };
}

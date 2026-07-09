import "server-only";
import { loadInstance } from "./source";
import { getAllOwners, getLinksFor, getOwner } from "@/lib/backoffice/store";
import { composeRegistry, type RegistryItem } from "@/lib/derive/registry";
import { composeDetail, type DetailModel } from "@/lib/derive/detail";
import { enrich, type Enrichment } from "@/lib/ai/enrich";

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
  return { items, live };
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

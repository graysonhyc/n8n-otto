import "server-only";
import { loadInstance } from "./source";
import { runSync } from "./sync";
import { getAllOwners, getBriefStates } from "@/lib/backoffice/store";
import { composeRegistry } from "@/lib/derive/registry";
import { credentialGroups } from "@/lib/derive/edges";
import { buildBrief, type BriefItem } from "@/lib/brief/build";

export interface BriefView {
  items: BriefItem[];
  live: boolean;
  scanned: number;
}

export async function loadBrief(): Promise<BriefView> {
  const [{ workflows, executions, live }, owners, states, { changes, scanned }] =
    await Promise.all([loadInstance(), getAllOwners(), getBriefStates(), runSync()]);

  const items = composeRegistry({ workflows, executions, owners, now: Date.now() });
  const sharedCredentials = credentialGroups(workflows);

  const brief = buildBrief({ items, changes, sharedCredentials }).filter(
    (b) => states.get(b.key) !== "dismissed",
  );

  return { items: brief, live, scanned };
}

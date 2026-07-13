import { PageHeader } from "@/components/shell/AppShell";
import { RegistryClient } from "@/components/registry/RegistryClient";
import { BreakdownPanel } from "@/components/charts/BreakdownPanel";
import { Chip } from "@/components/ui/Chip";
import { loadRegistry } from "@/lib/data/load";
import { computeByTeam } from "@/lib/derive/overview";
import { TYPE_LABEL } from "@/lib/format";
import type { WorkflowType } from "@/lib/n8n/types";

export const dynamic = "force-dynamic";

// Order the type breakdown deterministic → AI-assisted → AI agent, with
// hand-written plurals ("AI-assisted" is an adjective, so it doesn't take -s).
const TYPE_ORDER: WorkflowType[] = ["deterministic", "ai-assisted", "ai-agent-tools"];
const TYPE_PLURAL: Record<WorkflowType, string> = {
  deterministic: "Workflows",
  "ai-assisted": "AI-assisted",
  "ai-agent-tools": "AI agents",
};

export default async function RegistryPage() {
  const { items, live } = await loadRegistry();
  const byTeam = computeByTeam(items);
  const byType = TYPE_ORDER.map((type) => ({
    type,
    count: items.filter((i) => i.type === type).length,
  })).filter((t) => t.count > 0);

  return (
    <div className="p-6">
      <PageHeader
        title="Workflow Registry"
        subtitle={
          <>
            {byType.map((t, idx) => (
              <span key={t.type}>
                {idx > 0 && " · "}
                <b className="font-semibold text-ink nums">{t.count}</b>{" "}
                {t.count === 1 ? TYPE_LABEL[t.type] : TYPE_PLURAL[t.type]}
              </span>
            ))}
          </>
        }
        actions={<Chip>{live ? "Live instance" : "Demo data"}</Chip>}
      />
      <BreakdownPanel title="Workflows by team" rows={byTeam} className="mb-4" />
      <RegistryClient items={items} />
    </div>
  );
}

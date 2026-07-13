import { PageHeader } from "@/components/shell/AppShell";
import { RegistryClient } from "@/components/registry/RegistryClient";
import { BreakdownPanel } from "@/components/charts/BreakdownPanel";
import { Chip } from "@/components/ui/Chip";
import { loadRegistry } from "@/lib/data/load";
import { computeByTeam } from "@/lib/derive/overview";

export const dynamic = "force-dynamic";

export default async function RegistryPage() {
  const { items, live } = await loadRegistry();
  const agents = items.filter((i) => i.hasAgent).length;
  const unowned = items.filter((i) => !i.owner).length;
  const byTeam = computeByTeam(items);

  return (
    <div className="p-6">
      <PageHeader
        title="Automation Registry"
        subtitle={
          <>
            <b className="font-semibold text-ink nums">{items.length}</b> workflows ·{" "}
            <b className="font-semibold text-ink nums">{agents}</b> AI agents ·{" "}
            <b className="font-semibold text-ink nums">{unowned}</b> unowned
          </>
        }
        actions={<Chip>{live ? "Live instance" : "Demo data"}</Chip>}
      />
      <BreakdownPanel title="Workflows by team" rows={byTeam} className="mb-4" />
      <RegistryClient items={items} />
    </div>
  );
}

import { PageHeader } from "@/components/shell/AppShell";
import { RegistryClient } from "@/components/registry/RegistryClient";
import { Chip } from "@/components/ui/Chip";
import { loadRegistry } from "@/lib/data/load";

export const dynamic = "force-dynamic";

export default async function RegistryPage() {
  const { items, live } = await loadRegistry();
  const agents = items.filter((i) => i.hasAgent).length;

  return (
    <div className="p-5">
      <PageHeader
        title="Automation Registry"
        subtitle={`${items.length} workflows · ${agents} AI agents`}
        actions={
          <Chip>{live ? "Live instance" : "Demo data"}</Chip>
        }
      />
      <RegistryClient items={items} />
    </div>
  );
}

import { PageHeader } from "@/components/shell/AppShell";
import { RegistryClient } from "@/components/registry/RegistryClient";
import { Chip } from "@/components/ui/Chip";
import { loadRegistry } from "@/lib/data/load";

export const dynamic = "force-dynamic";

export default async function RegistryPage() {
  const { items, live } = await loadRegistry();
  const agents = items.filter((i) => i.hasAgent).length;
  const unowned = items.filter((i) => !i.owner).length;

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
      <RegistryClient items={items} />
    </div>
  );
}

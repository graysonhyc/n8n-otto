import { PageHeader } from "@/components/shell/AppShell";
import { Chip } from "@/components/ui/Chip";
import { MapCanvas } from "@/components/map/MapCanvas";
import { loadMap } from "@/lib/data/map";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const { graph, live } = await loadMap();
  const workflows = graph.nodes.filter((n) => n.kind === "workflow").length;
  const systems = graph.nodes.filter((n) => n.kind === "system").length;

  return (
    <div className="flex h-full flex-col p-6">
      <PageHeader
        title="Dependency Map"
        subtitle={
          <>
            <b className="font-semibold text-ink nums">{workflows}</b> workflows ·{" "}
            <b className="font-semibold text-ink nums">{systems}</b> systems ·{" "}
            <b className="font-semibold text-ink nums">{graph.edges.length}</b> connections
          </>
        }
        actions={<Chip>{live ? "Live instance" : "Demo data"}</Chip>}
      />
      <MapCanvas graph={graph} live={live} />
    </div>
  );
}

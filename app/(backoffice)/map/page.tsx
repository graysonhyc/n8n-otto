import { PageHeader } from "@/components/shell/AppShell";
import { Chip } from "@/components/ui/Chip";
import { MapCanvas } from "@/components/map/MapCanvas";
import { ModeToggle, type RelView } from "@/components/map/ModeToggle";
import { ProcessTable } from "@/components/relationships/ProcessTable";
import { loadDeterministic, loadGroups } from "@/lib/data/map";

export const dynamic = "force-dynamic";

function parseView(v: string | string[] | undefined): RelView {
  return v === "auto" ? "auto" : "groups";
}

export default async function RelationshipsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const view = parseView((await searchParams).view);

  if (view === "auto") {
    // The full graph is computed with every layer; the canvas filters client-side.
    const { graph, live } = await loadDeterministic({ dataSources: true, credentials: true });
    const workflows = graph.nodes.filter((n) => n.kind === "workflow").length;
    const deps = graph.edges.filter((e) => e.kind === "calls" || e.kind === "subworkflow-tool").length;
    return (
      <div className="flex h-full flex-col p-6">
        <PageHeader
          title="Relationships"
          subtitle={
            <>
              <b className="font-semibold text-ink nums">{workflows}</b> workflows ·{" "}
              <b className="font-semibold text-ink nums">{deps}</b> dependencies · auto-parsed
            </>
          }
          actions={
            <div className="flex items-center gap-2">
              <ModeToggle view={view} />
              <Chip>{live ? "Live instance" : "Demo data"}</Chip>
            </div>
          }
        />
        <MapCanvas graph={graph} live={live} />
      </div>
    );
  }

  const groups = await loadGroups();
  return (
    <div className="flex h-full flex-col p-6">
      <PageHeader
        title="Relationships"
        subtitle={
          <>
            <b className="font-semibold text-ink nums">{groups.rows.length}</b> process
            {groups.rows.length === 1 ? "" : "es"} ·{" "}
            <b className="font-semibold text-ink nums">{groups.unassignedCount}</b> of{" "}
            <b className="font-semibold text-ink nums">{groups.totalWorkflows}</b> workflows unassigned
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <ModeToggle view={view} />
            <Chip>{groups.live ? "Live instance" : "Demo data"}</Chip>
          </div>
        }
      />
      <ProcessTable {...groups} />
    </div>
  );
}

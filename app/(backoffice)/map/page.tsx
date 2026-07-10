import { PageHeader } from "@/components/shell/AppShell";
import { Chip } from "@/components/ui/Chip";
import { MapCanvas } from "@/components/map/MapCanvas";
import { ModeToggle, type RelView } from "@/components/map/ModeToggle";
import { GroupsBoard } from "@/components/relationships/GroupsBoard";
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

  const { sops, workflowsById, unassignedIds, live } = await loadGroups();
  return (
    <div className="flex h-full flex-col p-6">
      <PageHeader
        title="Relationships"
        subtitle={
          <>
            <b className="font-semibold text-ink nums">{sops.length}</b> process group
            {sops.length === 1 ? "" : "s"} ·{" "}
            <b className="font-semibold text-ink nums">{unassignedIds.length}</b> unassigned
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <ModeToggle view={view} />
            <Chip>{live ? "Live instance" : "Demo data"}</Chip>
          </div>
        }
      />
      <GroupsBoard sops={sops} workflowsById={workflowsById} unassignedIds={unassignedIds} live={live} />
    </div>
  );
}

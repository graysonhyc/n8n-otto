import { PageHeader } from "@/components/shell/AppShell";
import { Chip } from "@/components/ui/Chip";
import { ProcessTable } from "@/components/relationships/ProcessTable";
import { RelationshipDashboard } from "@/components/relationships/RelationshipDashboard";
import { loadGroups, loadRelationshipsView } from "@/lib/data/map";

export const dynamic = "force-dynamic";

export default async function RelationshipsPage() {
  const [groups, relationships] = await Promise.all([loadGroups(), loadRelationshipsView()]);

  return (
    <div className="flex h-full flex-col p-6">
      <PageHeader
        title="Relationships"
        subtitle={
          <>
            <b className="font-semibold text-ink nums">{groups.rows.length}</b> linked group
            {groups.rows.length === 1 ? "" : "s"} ·{" "}
            <b className="font-semibold text-ink nums">{groups.unassignedCount}</b> of{" "}
            <b className="font-semibold text-ink nums">{groups.totalWorkflows}</b> workflows unassigned
          </>
        }
        actions={<Chip>{groups.live ? "Live instance" : "Demo data"}</Chip>}
      />
      <RelationshipDashboard view={relationships} />
      <ProcessTable {...groups} />
    </div>
  );
}

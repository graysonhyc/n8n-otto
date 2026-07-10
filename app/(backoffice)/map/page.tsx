import { PageHeader } from "@/components/shell/AppShell";
import { Chip } from "@/components/ui/Chip";
import { ProcessTable } from "@/components/relationships/ProcessTable";
import { SuggestedProcesses } from "@/components/relationships/SuggestedProcesses";
import { loadGroups, loadSuggestions } from "@/lib/data/map";

export const dynamic = "force-dynamic";

export default async function RelationshipsPage() {
  const [groups, { suggestions }] = await Promise.all([loadGroups(), loadSuggestions()]);

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
        actions={<Chip>{groups.live ? "Live instance" : "Demo data"}</Chip>}
      />
      <SuggestedProcesses suggestions={suggestions} />
      <ProcessTable {...groups} />
    </div>
  );
}

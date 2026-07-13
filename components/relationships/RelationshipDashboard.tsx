import type { RelationshipsView } from "@/lib/data/map";

const RELATION_LABEL: Record<string, string> = {
  "depends-on": "depends on",
  triggers: "triggers",
  "duplicate-of": "duplicate of",
  "part-of-process": "linked with",
  "shares-data-with": "shares data with",
};

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4 shadow-card">
      <div className="text-[22px] font-semibold text-ink nums leading-none">{value}</div>
      <div className="mt-1.5 text-[12px] font-medium text-ink">{label}</div>
      {hint && <div className="text-[11px] text-faint">{hint}</div>}
    </div>
  );
}

/**
 * Estate relationship summary + tables. Deliberately NOT an estate-wide graph
 * (does not scale): headline coupling metrics, the integrations shared by ≥2
 * workflows (blast surface), and the human-authored links.
 */
export function RelationshipDashboard({ view }: { view: RelationshipsView }) {
  const { summary, sharedIntegrations, manualLinks, duplicates } = view;
  return (
    <div className="mb-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Shared integrations" value={sharedIntegrations.length} hint="used by ≥2 workflows" />
        <Tile label="Connections" value={summary.connectionCount} hint="sub-calls, agents, webhooks" />
        <Tile label="Shared data sources" value={summary.dataSourceLinkCount} hint="same sheet/table/folder" />
        <Tile label="Possible duplicates" value={duplicates.length} hint="semantically similar" />
        <Tile label="Manual links" value={manualLinks.length} hint="human-authored" />
      </div>

      <section className="rounded-xl border border-line bg-panel shadow-card">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[11.5px] font-semibold tracking-[0.07em] text-muted uppercase">
            Shared integrations
          </h2>
          <p className="mt-0.5 text-[11px] text-faint">
            Break or rotate one of these and every listed workflow is at risk.
          </p>
        </div>
        {sharedIntegrations.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-faint">No integration is shared by two or more workflows yet.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-faint">
                <th className="px-4 py-2 font-medium">Integration</th>
                <th className="px-4 py-2 font-medium nums">Workflows</th>
                <th className="px-4 py-2 font-medium">Used by</th>
              </tr>
            </thead>
            <tbody>
              {sharedIntegrations.map((r) => (
                <tr key={r.integration} className="border-t border-line-2">
                  <td className="px-4 py-2 font-medium text-ink">{r.integration}</td>
                  <td className="px-4 py-2 text-ink nums">{r.workflowCount}</td>
                  <td className="px-4 py-2 text-muted">{r.workflowNames.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {duplicates.length > 0 && (
        <section className="rounded-xl border border-line bg-panel shadow-card">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-[11.5px] font-semibold tracking-[0.07em] text-muted uppercase">
              Possible duplicates
            </h2>
            <p className="mt-0.5 text-[11px] text-faint">
              Workflows doing a similar job — candidates to consolidate. Confirm from a workflow&apos;s Relationships tab.
            </p>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-faint">
                <th className="px-4 py-2 font-medium">Workflow</th>
                <th className="px-4 py-2 font-medium">Looks like</th>
                <th className="px-4 py-2 font-medium nums">Similarity</th>
              </tr>
            </thead>
            <tbody>
              {duplicates.map((d) => (
                <tr key={`${d.aName}|${d.bName}`} className="border-t border-line-2">
                  <td className="px-4 py-2 font-medium text-ink">{d.aName}</td>
                  <td className="px-4 py-2 font-medium text-ink">{d.bName}</td>
                  <td className="px-4 py-2 text-muted nums">{Math.round(d.score * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="rounded-xl border border-line bg-panel shadow-card">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[11.5px] font-semibold tracking-[0.07em] text-muted uppercase">
            Manually linked workflows
          </h2>
          <p className="mt-0.5 text-[11px] text-faint">
            Links a human confirmed. Add or remove them from a workflow&apos;s Relationships tab.
          </p>
        </div>
        {manualLinks.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-faint">No manual links yet.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-faint">
                <th className="px-4 py-2 font-medium">From</th>
                <th className="px-4 py-2 font-medium">Relation</th>
                <th className="px-4 py-2 font-medium">To</th>
              </tr>
            </thead>
            <tbody>
              {manualLinks.map((l) => (
                <tr key={l.id} className="border-t border-line-2">
                  <td className="px-4 py-2 font-medium text-ink">{l.fromName}</td>
                  <td className="px-4 py-2 text-muted">{RELATION_LABEL[l.relation] ?? l.relation}</td>
                  <td className="px-4 py-2 font-medium text-ink">{l.toName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

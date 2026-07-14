import type { RelationshipsView } from "@/lib/data/map";

/**
 * Estate relationship tables. Deliberately NOT an estate-wide graph (does not
 * scale): the concrete workflow→workflow connections, the integrations shared by
 * ≥2 workflows (blast surface), and possible semantic duplicates.
 */
export function RelationshipDashboard({ view }: { view: RelationshipsView }) {
  const { connections, sharedIntegrations, duplicates } = view;
  return (
    <div className="mb-4 space-y-4">
      <section className="rounded-xl border border-line bg-panel shadow-card">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[11.5px] font-semibold tracking-[0.07em] text-muted uppercase">
            Connections
          </h2>
          <p className="mt-0.5 text-[11px] text-faint">
            Direct workflow-to-workflow dependencies: sub-workflow calls, agent sub-workflows, and webhook hand-offs.
          </p>
        </div>
        {connections.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-faint">No workflow directly calls or depends on another yet.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-faint">
                <th className="px-4 py-2 font-medium">Workflow</th>
                <th className="px-4 py-2 font-medium">Depends on</th>
                <th className="px-4 py-2 font-medium">Via</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c, i) => (
                <tr key={`${c.fromName}|${c.toName}|${i}`} className="border-t border-line-2">
                  <td className="px-4 py-2 font-medium text-ink">{c.fromName}</td>
                  <td className="px-4 py-2 font-medium text-ink">{c.toName}</td>
                  <td className="px-4 py-2 text-muted">{c.kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

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
    </div>
  );
}

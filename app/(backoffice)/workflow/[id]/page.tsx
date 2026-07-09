import { notFound } from "next/navigation";
import { loadDetailPage } from "@/lib/data/load";
import { PageHeader } from "@/components/shell/AppShell";
import { Section, KeyValue } from "@/components/ui/Section";
import { Pill } from "@/components/ui/Pill";
import { Chip } from "@/components/ui/Chip";
import { Relationships } from "@/components/detail/Relationships";
import { TYPE_LABEL, TRIGGER_LABEL, relativeTime, riskTone, typeTone } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function WorkflowDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadDetailPage(id);
  if (!data) notFound();

  const { detail, enrichment, workflowOptions } = data;
  const { item } = detail;

  return (
    <div className="p-5">
      <PageHeader
        title={item.name}
        subtitle={`${item.project ?? "No project"} · last changed ${relativeTime(item.lastChange)}`}
        actions={
          <div className="flex items-center gap-2">
            <Pill tone={riskTone(item.risk)}>{item.risk.label}</Pill>
            <Pill tone={typeTone(item.type)}>{TYPE_LABEL[item.type]}</Pill>
          </div>
        }
      />

      {item.disconnectedNodes.length > 0 && (
        <div className="mb-3.5 rounded-xl border border-[#4a1f1a] bg-[#2a1512] px-4 py-3 text-[13px] text-[#ffb4ad]">
          <b className="text-white">⚠ {item.disconnectedNodes.length} disconnected step(s).</b>{" "}
          Unreachable from the trigger — will silently never run:{" "}
          <span className="text-white">{item.disconnectedNodes.join(", ")}</span>. Reconnect or
          remove them in n8n.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        {/* Left column */}
        <div className="flex flex-col gap-3.5">
          <Section
            title="Summary"
            glyph="◷"
            aside={<Chip>{enrichment.source === "ai" ? "AI summary" : "heuristic"}</Chip>}
          >
            <p className="text-[13px] text-ink">{enrichment.businessPurpose}</p>
            <div className="mt-3">
              <KeyValue
                rows={[
                  ["Input", enrichment.input.join(", ") || "—"],
                  ["Output", enrichment.output.join(", ") || "—"],
                  ["Trigger", TRIGGER_LABEL[item.trigger]],
                ]}
              />
            </div>
          </Section>

          <Relationships workflowId={id} detail={detail} options={workflowOptions} />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3.5">
          <Section title="Ownership" glyph="◑">
            {item.owner ? (
              <KeyValue
                rows={[
                  [
                    "Owner",
                    <span key="o" className="inline-flex items-center gap-2">
                      {item.owner.team}
                      <Pill tone="ok" dot={false}>
                        {item.owner.confirmed ? "confirmed" : "inferred"}
                      </Pill>
                    </span>,
                  ],
                  [
                    "Channel",
                    item.owner.slackChannelName ? (
                      <span className="text-accent">{item.owner.slackChannelName}</span>
                    ) : (
                      "—"
                    ),
                  ],
                ]}
              />
            ) : (
              <p className="text-[13px] text-danger">
                No owner assigned. Assign one from the Registry to enable Slack routing.
              </p>
            )}
            <div className="mt-3 rounded-lg border-l-2 border-ai bg-panel-3 px-3 py-2 text-[12.5px] text-muted">
              <b className="text-ink">Why this owner: </b>
              {enrichment.ownerReasoning}
            </div>
          </Section>

          <Section title="AI behaviour" glyph="◎">
            {item.usesAI ? (
              <KeyValue
                rows={[
                  ["Model", item.model ?? "—"],
                  [
                    "Tools",
                    item.toolNames.length ? (
                      <span className="flex flex-wrap gap-1">
                        {item.toolNames.map((t) => (
                          <Chip key={t} tone="ai">
                            {t}
                          </Chip>
                        ))}
                      </span>
                    ) : (
                      "none"
                    ),
                  ],
                  [
                    "Human review",
                    item.humanInLoop ? (
                      <Pill tone="ok" dot={false}>
                        present
                      </Pill>
                    ) : (
                      <Pill tone="danger" dot={false}>
                        none
                      </Pill>
                    ),
                  ],
                ]}
              />
            ) : (
              <p className="text-[13px] text-muted">No AI involved — deterministic workflow.</p>
            )}
            <p className="mt-2.5 text-[12.5px] text-muted">{enrichment.aiBehaviour}</p>
          </Section>

          <Section title="Runbook" glyph="▦" aside={<Chip>AI-generated</Chip>}>
            <ol className="ml-4 flex list-decimal flex-col gap-1 text-[13px] text-muted">
              {enrichment.runbook.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
    </div>
  );
}

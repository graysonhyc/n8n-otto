import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shell/AppShell";
import { Chip } from "@/components/ui/Chip";
import { Pill, type Tone } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { Donut, HBars, Legend, Sparkline } from "@/components/charts/Charts";
import { loadOverview } from "@/lib/data/overview";
import type { BriefItem, Severity } from "@/lib/brief/build";

export const dynamic = "force-dynamic";

const SEV_TONE: Record<Severity, Tone> = { high: "danger", medium: "warn", low: "neutral" };
const SEV_DOT: Record<Severity, string> = {
  high: "var(--color-danger)",
  medium: "var(--color-warn)",
  low: "var(--color-faint)",
};

function StatTile({
  label,
  value,
  sub,
  dot,
  children,
}: {
  label: string;
  value: ReactNode;
  sub: ReactNode;
  dot: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3.5 shadow-card">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-faint uppercase">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} aria-hidden />
        {label}
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="font-mono text-[28px] leading-none font-semibold tracking-[-0.02em] nums">{value}</div>
        {children}
      </div>
      <div className="mt-1.5 text-[11.5px] text-muted">{sub}</div>
    </div>
  );
}

function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-panel shadow-card ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-[11.5px] font-semibold tracking-[0.07em] text-muted uppercase">{title}</h2>
        {aside}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function QueueRow({ item }: { item: BriefItem }) {
  const inner = (
    <>
      <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: SEV_DOT[item.severity] }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-ink">{item.title}</div>
        <div className="truncate text-[12px] text-muted">{item.recommendedAction}</div>
      </div>
      <span className="hidden flex-none text-[12px] text-muted sm:block">{item.suggestedOwner}</span>
      <Pill tone={SEV_TONE[item.severity]} dot={false}>
        {item.severity}
      </Pill>
    </>
  );
  const cls =
    "flex items-start gap-3 border-b border-line px-4 py-2.5 last:border-0 transition-colors hover:bg-panel-2";
  return item.workflowId ? (
    <Link href={`/workflow/${item.workflowId}`} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export default async function OverviewPage() {
  const { overview: o, brief, live } = await loadOverview();
  const queue = [...brief]
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.severity] - rank[b.severity];
    })
    .slice(0, 7);

  return (
    <div className="p-6">
      <PageHeader
        title="Overview"
        subtitle={
          <>
            <b className="font-semibold text-ink nums">{o.total}</b> workflows ·{" "}
            <b className="font-semibold text-ink nums">{o.aiAgents}</b> AI agents ·{" "}
            <b className="font-semibold text-ink nums">{o.needsAttention}</b> need attention
          </>
        }
        actions={<Chip>{live ? "Live instance" : "Demo data"}</Chip>}
      />

      {/* KPI tiles */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Workflows"
          value={o.total}
          dot="var(--color-info)"
          sub={`${o.aiAgents} AI agents · ${o.byType.length} types`}
        />
        <StatTile
          label="Needs attention"
          value={o.needsAttention}
          dot="var(--color-danger)"
          sub={
            <>
              <b className="font-semibold text-ink nums">{o.atRisk}</b> at risk of failing
            </>
          }
        />
        <StatTile
          label="Ownership"
          value={`${o.coveragePct}%`}
          dot={o.unowned ? "var(--color-warn)" : "var(--color-ok)"}
          sub={`${o.unowned} of ${o.total} unowned`}
        >
          <span className="mb-1 h-1.5 w-20 overflow-hidden rounded-full bg-panel-3">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${o.coveragePct}%` }} />
          </span>
        </StatTile>
        <StatTile
          label="Executions · 14d"
          value={o.execTotal}
          dot="var(--color-ok)"
          sub={`${o.failRate}% failed`}
        >
          <span className="mb-0.5 block h-7 w-24 text-ok">
            <Sparkline data={o.execTrend} className="h-full w-full" />
          </span>
        </StatTile>
      </div>

      {/* queue + charts */}
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-4">
          <Panel
            title="Needs attention"
            aside={
              <Link href="/brief" className="flex items-center gap-1 text-[12px] font-medium text-accent-strong hover:underline">
                View all brief <Icon name="chevron" size={12} />
              </Link>
            }
            className="overflow-hidden"
          >
            {queue.length === 0 ? (
              <div className="grid place-items-center gap-2 py-10 text-center">
                <Icon name="check" size={26} className="text-ok" strokeWidth={2} />
                <p className="text-[13px] text-muted">All clear — nothing needs attention.</p>
              </div>
            ) : (
              <div className="-mx-4 -my-4">
                {queue.map((item) => (
                  <QueueRow key={item.key} item={item} />
                ))}
              </div>
            )}
          </Panel>

          {o.byTeam.length > 0 && (
            <Panel title="Workflows by team">
              <HBars rows={o.byTeam} />
            </Panel>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Workflow health">
            <div className="flex items-center gap-5">
              <Donut segments={o.health} centerValue={o.total} centerLabel="total" />
              <div className="flex-1">
                <Legend segments={o.health} />
              </div>
            </div>
          </Panel>

          {o.bySystem.length > 0 && (
            <Panel title="Top integrations">
              <HBars rows={o.bySystem} />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

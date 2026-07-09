import type { ReactNode } from "react";

export function Section({
  title,
  icon,
  aside,
  children,
}: {
  title: string;
  icon?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-panel-2 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-muted">
        {icon && <span className="text-accent">{icon}</span>}
        {title}
        {aside && <span className="ml-auto normal-case tracking-normal">{aside}</span>}
      </h2>
      {children}
    </section>
  );
}

export function KeyValue({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[13px]">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="pt-0.5 text-[11px] uppercase tracking-wide text-faint">{k}</dt>
          <dd className="m-0 text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

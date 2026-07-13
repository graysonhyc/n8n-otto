import type { ReactNode } from "react";
import { HBars } from "./Charts";

/**
 * A titled panel wrapping an {@link HBars} breakdown. Extracted from the old
 * Overview page so Registry (workflows-by-team) and Relationships (top
 * integrations) can render the same chart. Server-renderable — no client JS.
 */
export function BreakdownPanel({
  title,
  rows,
  aside,
  className = "",
}: {
  title: string;
  rows: { label: string; value: number; color?: string }[];
  aside?: ReactNode;
  className?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className={`rounded-xl border border-line bg-panel shadow-card ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-[11.5px] font-semibold tracking-[0.07em] text-muted uppercase">{title}</h2>
        {aside}
      </div>
      <div className="p-4">
        <HBars rows={rows} />
      </div>
    </section>
  );
}

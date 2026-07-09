"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = {
  href: string;
  label: string;
  glyph: string;
  badge?: number;
  soon?: boolean;
};

const BACKOFFICE: Item[] = [
  { href: "/brief", label: "Brief", glyph: "◉", badge: 4 },
  { href: "/registry", label: "Registry", glyph: "▤" },
  { href: "/responsibility", label: "Responsibility", glyph: "◑", soon: true },
  { href: "/map", label: "Map", glyph: "◈", soon: true },
  { href: "/change", label: "Change Memory", glyph: "◔", soon: true },
];

function Row({ item, active }: { item: Item; active: boolean }) {
  const base =
    "flex items-center gap-2.5 rounded-[7px] px-2.5 py-1.5 text-[13px]";
  if (item.soon) {
    return (
      <span
        className={`${base} cursor-default text-faint/70`}
        title="Coming in a later phase"
      >
        <span className="w-[15px] text-center opacity-70">{item.glyph}</span>
        {item.label}
        <span className="ml-auto text-[9px] uppercase tracking-wider text-faint">
          soon
        </span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`${base} ${
        active ? "bg-accent-dim text-white" : "text-muted hover:text-ink"
      }`}
    >
      <span
        className={`w-[15px] text-center ${active ? "text-accent" : "opacity-80"}`}
      >
        {item.glyph}
      </span>
      {item.label}
      {item.badge ? (
        <span className="ml-auto rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

export function SideNav() {
  const pathname = usePathname();
  return (
    <aside className="border-r border-line bg-panel px-3 py-4">
      <div className="mb-2 px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
        Backoffice
      </div>
      <div className="flex flex-col gap-0.5">
        {BACKOFFICE.map((item) => (
          <Row
            key={item.href}
            item={item}
            active={pathname === item.href || pathname.startsWith(item.href + "/")}
          />
        ))}
      </div>
      <div className="mt-5 mb-2 px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
        n8n
      </div>
      <div className="flex flex-col gap-0.5 opacity-60">
        {[
          ["⌂", "Overview"],
          ["▸", "Workflows"],
          ["◷", "Executions"],
          ["📊", "Insights"],
        ].map(([g, l]) => (
          <span
            key={l}
            className="flex cursor-default items-center gap-2.5 rounded-[7px] px-2.5 py-1.5 text-[13px] text-muted"
          >
            <span className="w-[15px] text-center opacity-80">{g}</span>
            {l}
          </span>
        ))}
      </div>
    </aside>
  );
}

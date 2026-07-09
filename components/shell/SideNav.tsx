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
    "flex items-center gap-3 rounded-[8px] px-3 py-2 text-[16px]";
  if (item.soon) {
    return (
      <span
        className={`${base} cursor-default text-faint/70`}
        title="Coming in a later phase"
      >
        <span className="w-[18px] text-center text-[17px] opacity-70">{item.glyph}</span>
        {item.label}
        <span className="ml-auto text-[10px] uppercase tracking-wider text-faint">
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
        className={`w-[18px] text-center text-[17px] ${active ? "text-accent" : "opacity-80"}`}
      >
        {item.glyph}
      </span>
      {item.label}
      {item.badge ? (
        <span className="ml-auto rounded-full bg-danger px-2 text-[11px] font-bold text-white">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

export function SideNav() {
  const pathname = usePathname();
  return (
    <aside className="border-r border-line bg-panel px-3 py-5">
      <Link
        href="/brief"
        className="mb-5 flex items-center gap-2.5 px-2 py-1"
        aria-label="n8n Backoffice — home"
      >
        <img
          src="/n8n.webp"
          alt=""
          width={28}
          height={28}
          className="rounded-[7px] shadow-sm ring-1 ring-line-2"
        />
        <span className="text-[15px] font-semibold tracking-tight text-ink">
          n8n <span className="text-muted">Backoffice</span>
        </span>
      </Link>
      <div className="flex flex-col gap-1">
        {BACKOFFICE.map((item) => (
          <Row
            key={item.href}
            item={item}
            active={pathname === item.href || pathname.startsWith(item.href + "/")}
          />
        ))}
      </div>
      <div className="mt-6 mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
        n8n
      </div>
      <div className="flex flex-col gap-1 opacity-60">
        {[
          ["⌂", "Overview"],
          ["▸", "Workflows"],
          ["◷", "Executions"],
          ["📊", "Insights"],
        ].map(([g, l]) => (
          <span
            key={l}
            className="flex cursor-default items-center gap-3 rounded-[8px] px-3 py-2 text-[16px] text-muted"
          >
            <span className="w-[18px] text-center text-[17px] opacity-80">{g}</span>
            {l}
          </span>
        ))}
      </div>
    </aside>
  );
}

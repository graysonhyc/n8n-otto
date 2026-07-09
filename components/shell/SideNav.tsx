"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

type Item = {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
  soon?: boolean;
};

const BACKOFFICE: Item[] = [
  { href: "/brief", label: "Brief", icon: "shield", badge: 4 },
  { href: "/registry", label: "Registry", icon: "table" },
  { href: "/map", label: "Map", icon: "map", soon: true },
];

const N8N: Item[] = [
  { href: "#", label: "Overview", icon: "home" },
  { href: "#", label: "Executions", icon: "pulse" },
];

const ROW = "flex items-center gap-3 rounded-md px-2.5 py-2 text-[13.5px] font-medium";

function Row({ item, active }: { item: Item; active: boolean }) {
  if (item.soon) {
    return (
      <span className={`${ROW} cursor-default text-faint`} title="Coming in a later phase">
        <Icon name={item.icon} size={16} className="opacity-70" />
        {item.label}
        <span className="ml-auto rounded-full border border-line-2 px-1.5 text-[9.5px] tracking-[0.1em] text-faint uppercase">
          soon
        </span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`${ROW} border transition-colors ${
        active
          ? "border-accent-line bg-accent-dim text-white"
          : "border-transparent text-muted hover:bg-panel-2 hover:text-ink"
      }`}
    >
      <Icon name={item.icon} size={16} className={active ? "text-accent" : "opacity-85"} />
      {item.label}
      {item.badge ? (
        <span
          className={`ml-auto min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-bold text-white nums ${
            active ? "bg-accent" : "bg-danger"
          }`}
        >
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function Label({ children }: { children: string }) {
  return (
    <div className="px-2.5 pt-3.5 pb-1.5 text-[10.5px] font-semibold tracking-[0.13em] text-faint uppercase">
      {children}
    </div>
  );
}

export function SideNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="flex flex-col gap-0.5 border-r border-line bg-[color-mix(in_srgb,var(--color-panel)_88%,black)] px-3 py-3.5">
      <Link href="/brief" className="mb-2 flex items-center gap-2.5 px-2 py-1" aria-label="n8n Backoffice — home">
        <span className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-gradient-to-br from-accent to-[#b8365a] shadow-[0_2px_8px_rgba(234,75,113,0.35)]">
          <Icon name="flow" size={15} className="text-white" strokeWidth={2} />
        </span>
        <span className="text-[13.5px] font-semibold tracking-[-0.01em]">
          n8n <span className="font-medium text-muted">Backoffice</span>
        </span>
      </Link>

      {BACKOFFICE.map((item) => (
        <Row key={item.href} item={item} active={isActive(item.href)} />
      ))}

      <Label>Jump to n8n</Label>
      {N8N.map((item) => (
        <Row key={item.label} item={item} active={false} />
      ))}

      <div className="mt-auto flex items-center gap-2.5 border-t border-line px-1 pt-3">
        <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-gradient-to-br from-info to-ai text-[11px] font-bold text-white">
          GH
        </span>
        <div className="text-[12.5px] leading-tight font-medium">
          Grayson Ho
          <div className="text-[11px] font-normal text-faint">Platform admin</div>
        </div>
      </div>
    </aside>
  );
}

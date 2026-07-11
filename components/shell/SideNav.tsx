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
  external?: boolean;
  disabled?: boolean;
  hint?: string;
};

const BACKOFFICE: Item[] = [
  { href: "/overview", label: "Overview", icon: "home" },
  { href: "/brief", label: "Brief", icon: "shield", badge: 4 },
  { href: "/registry", label: "Registry", icon: "table" },
  { href: "/map", label: "Relationships", icon: "map" },
];

// Deep-links into the connected n8n instance. Built from N8N_BASE_URL; when it's
// not configured they render disabled rather than as dead "#" links.
function n8nItems(baseUrl?: string): Item[] {
  const base = baseUrl?.replace(/\/$/, "");
  const links: { label: string; icon: IconName; path: string }[] = [
    { label: "Workflows", icon: "flow", path: "/home/workflows" },
    { label: "Executions", icon: "pulse", path: "/home/executions" },
  ];
  return links.map(({ label, icon, path }) =>
    base
      ? { href: `${base}${path}`, label, icon, external: true }
      : { href: "#", label, icon, disabled: true, hint: "Set N8N_BASE_URL to enable" },
  );
}

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
  if (item.disabled) {
    return (
      <span className={`${ROW} cursor-not-allowed text-faint`} title={item.hint}>
        <Icon name={item.icon} size={16} className="opacity-70" />
        {item.label}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      target={item.external ? "_blank" : undefined}
      rel={item.external ? "noreferrer" : undefined}
      className={`${ROW} border transition-colors ${
        active
          ? "border-accent-line bg-accent-dim text-accent-strong"
          : "border-transparent text-muted hover:bg-panel-2 hover:text-ink"
      }`}
    >
      <Icon name={item.icon} size={16} className={active ? "text-accent" : "opacity-85"} />
      {item.label}
      {item.external && (
        <Icon name="external" size={13} className="ml-auto text-faint" />
      )}
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

export function SideNav({ n8nBaseUrl }: { n8nBaseUrl?: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const n8n = n8nItems(n8nBaseUrl);

  return (
    <aside className="flex flex-col gap-0.5 border-r border-line bg-panel px-3 py-3.5">
      <Link href="/overview" className="mb-2 flex items-center gap-2.5 px-2 py-1" aria-label="n8n Otto — home">
        <span className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-accent shadow-[0_1px_2px_rgba(234,75,113,0.35)]">
          <Icon name="flow" size={15} className="text-white" strokeWidth={2} />
        </span>
        <span className="text-[13.5px] font-semibold tracking-[-0.01em]">
          n8n <span className="font-medium text-muted">Otto</span>
        </span>
      </Link>

      {BACKOFFICE.map((item) => (
        <Row key={item.href} item={item} active={isActive(item.href)} />
      ))}

      <Label>Jump to n8n</Label>
      {n8n.map((item) => (
        <Row key={item.label} item={item} active={false} />
      ))}

      <div className="mt-auto flex items-center gap-2.5 border-t border-line px-1 pt-3">
        <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
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

import type { ReactNode } from "react";
import { Rail } from "./Rail";
import { SideNav } from "./SideNav";

// Three-column app frame: icon rail · Backoffice nav · content.
// Mirrors the n8n editor chrome so Backoffice reads as a native module.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-screen grid-cols-[52px_210px_1fr] overflow-hidden">
      <Rail />
      <SideNav />
      <main className="overflow-auto">{children}</main>
    </div>
  );
}

// Shared page header used by every screen.
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight text-balance">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

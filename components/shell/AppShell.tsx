import type { ReactNode } from "react";
import { SideNav } from "./SideNav";

// Two-column app frame: Backoffice nav · content.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-screen grid-cols-[248px_1fr] overflow-hidden">
      <SideNav />
      <main className="overflow-auto [zoom:1.1]">{children}</main>
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
        <h1 className="text-[24px] font-semibold tracking-tight text-balance">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

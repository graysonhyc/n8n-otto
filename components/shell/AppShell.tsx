import type { ReactNode } from "react";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";
import { ToastProvider } from "@/components/ui/Toast";

// App frame: nav rail · (command bar + scrolling content). Toasts and the
// command palette live at the top level so any screen can reach them.
export function AppShell({ children }: { children: ReactNode }) {
  // Server-only env, read here and threaded into the client nav for deep-links.
  const n8nBaseUrl = process.env.N8N_BASE_URL;
  return (
    <ToastProvider>
      <div className="grid h-screen grid-cols-[232px_1fr] overflow-hidden">
        <SideNav n8nBaseUrl={n8nBaseUrl} />
        <div className="flex flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
      <CommandPalette />
    </ToastProvider>
  );
}

// Shared page header used by every screen, below the command bar.
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4.5 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[23px] font-bold tracking-[-0.02em] text-balance">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[13.5px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

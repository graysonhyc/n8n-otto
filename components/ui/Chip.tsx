import type { ReactNode } from "react";

export function Chip({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "ai";
}) {
  const cls =
    tone === "ai"
      ? "text-ai border-[#332a55] bg-[#1b1630]"
      : "text-muted border-line bg-panel-3";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] whitespace-nowrap ${cls}`}
    >
      {children}
    </span>
  );
}

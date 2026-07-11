import type { ReactNode } from "react";

export type Tone = "danger" | "warn" | "ok" | "ai" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  danger: "text-danger-fg bg-danger-bg border-danger-bd",
  warn: "text-warn-fg bg-warn-bg border-warn-bd",
  ok: "text-ok-fg bg-ok-bg border-ok-bd",
  ai: "text-ai-fg bg-ai-bg border-ai-bd",
  info: "text-info-fg bg-info-bg border-info-bd",
  neutral: "text-neutral-fg bg-neutral-bg border-neutral-bd",
};

export function Pill({
  tone = "neutral",
  children,
  dot = true,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONES[tone]}`}
    >
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      )}
      {children}
    </span>
  );
}

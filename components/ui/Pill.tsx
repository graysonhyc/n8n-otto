import type { ReactNode } from "react";

export type Tone = "danger" | "warn" | "ok" | "ai" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  danger: "text-[#ff8078] bg-[#2a1512] border-[#4a1f1a]",
  warn: "text-[#f6bb54] bg-[#271e0f] border-[#4a3818]",
  ok: "text-[#5ad6a0] bg-[#0f231b] border-[#1c4535]",
  ai: "text-[#b8a2f5] bg-[#1b1630] border-[#332a55]",
  info: "text-[#89b0f5] bg-[#131c2c] border-[#243a5c]",
  neutral: "text-[#a6a6b2] bg-[#1a1a22] border-[#2d2d38]",
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
